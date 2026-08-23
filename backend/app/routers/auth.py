import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..config import settings
from ..models import User, RefreshToken, AuditLog, Role, BackupCode
from ..schemas import (
    LoginRequest, UserOut, ChangePasswordRequest, UserStatusOut,
    TotpSetupResponse, TotpVerifyRequest, TotpDisableRequest, BackupCodesResponse,
    NameStyleUpdate,
)
from ..security import (
    verify_password, hash_password, create_access_token,
    generate_refresh_token, hash_refresh_token,
    generate_totp_secret, totp_provisioning_uri, verify_totp,
    generate_backup_codes, hash_backup_code,
)
from ..deps import get_current_user, verify_csrf

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

REFRESH_COOKIE_PATH = "/api/auth"


def _set_auth_cookies(response: Response, access_token: str, access_expires_in: int, refresh_raw: str):
    secure = settings.cookie_secure
    response.set_cookie("access_token", access_token, max_age=access_expires_in,
                         httponly=True, secure=secure, samesite="strict", path="/")
    response.set_cookie("refresh_token", refresh_raw,
                         max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                         httponly=True, secure=secure, samesite="strict", path=REFRESH_COOKIE_PATH)
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie("csrf_token", csrf_token,
                         max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                         httponly=False, secure=secure, samesite="strict", path="/")


async def _log(db: AsyncSession, user_id: str | None, action: str, request: Request, entity="", entity_id=""):
    db.add(AuditLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id,
                     ip_address=request.client.host if request.client else ""))
    await db.commit()


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, response: Response, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))

    # Generische Fehlermeldung, um Nutzer-Enumeration zu verhindern
    generic_error = HTTPException(status.HTTP_401_UNAUTHORIZED, "E-Mail oder Passwort ist falsch")

    if not user:
        await _log(db, None, "login_failed_unknown_email", request)
        raise generic_error

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_423_LOCKED,
                             "Konto vorübergehend gesperrt wegen zu vieler Fehlversuche. Bitte später erneut versuchen.")

    if not verify_password(payload.password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOCKOUT_MINUTES)
        await db.commit()
        await _log(db, user.id, "login_failed", request)
        raise generic_error

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto ist deaktiviert")

    # Zweiter Faktor - erst NACH erfolgreicher Passwortpruefung, damit der
    # 2FA-Status kein Hinweis auf die Existenz eines Kontos ist.
    if user.totp_enabled:
        if not payload.totp_code:
            # 401 + Marker: Frontend blendet daraufhin das Code-Feld ein.
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Bestaetigungscode aus deiner Authenticator-App erforderlich",
                headers={"X-2FA-Required": "1"},
            )
        code_ok = verify_totp(user.totp_secret or "", payload.totp_code)

        # Alternativ ein Einmal-Code (Format XXXX-XXXX), falls das Telefon fehlt.
        if not code_ok:
            candidate = await db.scalar(
                select(BackupCode).where(
                    BackupCode.user_id == user.id,
                    BackupCode.code_hash == hash_backup_code(payload.totp_code),
                    BackupCode.used_at.is_(None),
                )
            )
            if candidate:
                candidate.used_at = datetime.now(timezone.utc)
                code_ok = True
                await _log(db, user.id, "login_backup_code_used", request)

        if not code_ok:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOCKOUT_MINUTES)
            await db.commit()
            await _log(db, user.id, "login_failed_totp", request)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bestaetigungscode ist ungültig oder abgelaufen")

    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    access_token, expires_in = create_access_token(user.id, user.role.value)
    refresh_raw, refresh_hash = generate_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else "",
    ))
    await db.commit()

    _set_auth_cookies(response, access_token, expires_in, refresh_raw)
    await _log(db, user.id, "login_success", request)
    return {"user": UserOut.model_validate(user)}


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Keine Sitzung vorhanden")

    token_hash = hash_refresh_token(raw)
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not token or token.revoked or token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sitzung abgelaufen, bitte erneut anmelden")

    user = await db.scalar(select(User).where(User.id == token.user_id))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Konto nicht verfuegbar")

    # Rotation: alten Refresh-Token widerrufen, neuen ausstellen
    token.revoked = True
    access_token, expires_in = create_access_token(user.id, user.role.value)
    refresh_raw, refresh_hash = generate_refresh_token()
    db.add(RefreshToken(
        user_id=user.id, token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else "",
    ))
    await db.commit()

    _set_auth_cookies(response, access_token, expires_in, refresh_raw)
    return {"user": UserOut.model_validate(user)}


@router.post("/logout", dependencies=[Depends(verify_csrf)])
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if raw:
        token_hash = hash_refresh_token(raw)
        token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        if token:
            token.revoked = True
            await db.commit()
    for cookie in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(cookie, path="/" if cookie != "refresh_token" else REFRESH_COOKIE_PATH)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/heartbeat", dependencies=[Depends(verify_csrf)])
async def heartbeat(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Wird alle ~25s vom Frontend aufgerufen, solange eine Seite offen ist -
    Grundlage fuer den Online-Status im Chat (siehe User.is_online). Bewusst
    ein simpler Zeitstempel statt eines Presence-Servers/WebSockets, das
    reicht fuer ein internes Buero-Tool voellig aus."""
    user.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/change-password", dependencies=[Depends(verify_csrf)])
async def change_password(payload: ChangePasswordRequest, request: Request,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aktuelles Passwort ist falsch")
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await _log(db, user.id, "password_changed", request)
    return {"ok": True}


# ---------------- Zwei-Faktor-Authentifizierung ----------------

@router.get("/status", response_model=UserStatusOut)
async def auth_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    remaining = await db.scalars(
        select(BackupCode).where(BackupCode.user_id == user.id, BackupCode.used_at.is_(None))
    )
    out = UserStatusOut.model_validate(user)
    out.backup_codes_remaining = len(remaining.all())
    return out


@router.post("/2fa/setup", response_model=TotpSetupResponse, dependencies=[Depends(verify_csrf)])
async def totp_setup(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Erzeugt ein neues Secret und liefert die otpauth-URI zurueck. Das Secret
    ist noch NICHT aktiv - erst /2fa/verify mit einem gueltigen Code schaltet es
    scharf. So kann man sich nicht aussperren, wenn der Scan schiefging."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Zwei-Faktor ist bereits aktiv")
    secret = generate_totp_secret()
    user.totp_secret = secret
    await db.commit()
    return TotpSetupResponse(
        provisioning_uri=totp_provisioning_uri(secret, user.email, settings.APP_NAME),
        secret=secret,
    )


@router.post("/2fa/verify", dependencies=[Depends(verify_csrf)])
async def totp_verify(payload: TotpVerifyRequest, request: Request,
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.totp_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zuerst die Einrichtung starten")
    if not verify_totp(user.totp_secret, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code ist ungültig oder abgelaufen")
    user.totp_enabled = True
    await db.commit()
    # Direkt einen Satz Einmal-Codes mitgeben - genau jetzt ist der richtige
    # Moment, sie zu sichern.
    codes = await _issue_backup_codes(db, user)
    await _log(db, user.id, "2fa_enabled", request)
    return {"ok": True, "backup_codes": codes}


@router.post("/2fa/disable", dependencies=[Depends(verify_csrf)])
async def totp_disable(payload: TotpDisableRequest, request: Request,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Deaktivieren erfordert das Passwort - sonst koennte ein uebernommenes
    Browser-Sitzungscookie den zweiten Faktor einfach abschalten."""
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwort ist falsch")
    user.totp_enabled = False
    user.totp_secret = None
    stale = await db.scalars(select(BackupCode).where(BackupCode.user_id == user.id))
    for c in stale.all():
        await db.delete(c)
    await db.commit()
    await _log(db, user.id, "2fa_disabled", request)
    return {"ok": True}


async def _issue_backup_codes(db: AsyncSession, user: User) -> list[str]:
    """Erzeugt einen frischen Satz und verwirft alle bisherigen Codes."""
    old = await db.scalars(select(BackupCode).where(BackupCode.user_id == user.id))
    for c in old.all():
        await db.delete(c)
    codes = generate_backup_codes()
    for code in codes:
        db.add(BackupCode(user_id=user.id, code_hash=hash_backup_code(code)))
    await db.commit()
    return codes


@router.post("/2fa/backup-codes", response_model=BackupCodesResponse,
              dependencies=[Depends(verify_csrf)])
async def regenerate_backup_codes(request: Request, user: User = Depends(get_current_user),
                                   db: AsyncSession = Depends(get_db)):
    """Neuen Satz Einmal-Codes erzeugen. Bisherige verlieren dabei ihre
    Gueltigkeit - so kann ein alter, evtl. kompromittierter Zettel nicht
    weiterverwendet werden."""
    if not user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                             "Zuerst Zwei-Faktor-Authentifizierung aktivieren")
    codes = await _issue_backup_codes(db, user)
    await _log(db, user.id, "backup_codes_generated", request)
    return BackupCodesResponse(codes=codes)


@router.put("/name-style", response_model=UserOut, dependencies=[Depends(verify_csrf)])
async def set_name_style(payload: NameStyleUpdate, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    """Rein kosmetisch - jede:r stellt den eigenen Stil selbst ein."""
    user.name_style = payload.name_style
    user.name_style_color = payload.name_style_color
    await db.commit()
    await db.refresh(user)
    return user
