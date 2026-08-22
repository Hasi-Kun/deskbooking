"""Passkeys / Sicherheitsschluessel (WebAuthn) als zweiter Faktor bzw. als
Ersatz fuer Passwort+TOTP beim Login.

Ablauf Registrierung (Nutzer ist bereits eingeloggt):
  1. POST /register/options  -> Challenge erzeugen, Optionen an den Browser
  2. Browser ruft navigator.credentials.create(...) auf
  3. POST /register/verify   -> Signatur pruefen, Credential speichern

Ablauf Login (Nutzer ist noch NICHT eingeloggt):
  1. POST /login/options {email} -> Challenge + erlaubte Credential-IDs
  2. Browser ruft navigator.credentials.get(...) auf
  3. POST /login/verify -> Signatur pruefen, normale Sitzung eroeffnen

Die Challenge liegt zwischen den beiden Aufrufen in der DB (WebAuthnChallenge),
da HTTP zustandslos ist und mehrere Backend-Worker laufen koennen - ein
In-Memory-Dict wuerde bei mehreren Prozessen nicht zuverlaessig funktionieren.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_registration_options, verify_registration_response,
    generate_authentication_options, verify_authentication_response,
)
from webauthn.helpers import options_to_json, parse_registration_credential_json, parse_authentication_credential_json
from webauthn.helpers.exceptions import InvalidRegistrationResponse, InvalidAuthenticationResponse
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor, AuthenticatorSelectionCriteria,
    ResidentKeyRequirement, UserVerificationRequirement, AuthenticatorAttachment,
)

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User, WebAuthnCredential, WebAuthnChallenge, AuditLog
from ..schemas import (
    WebAuthnRegisterVerify, WebAuthnLoginOptionsRequest, WebAuthnLoginVerify, PasskeyOut,
)
from ..deps import verify_csrf
from ..security import create_access_token, generate_refresh_token
from .auth import _set_auth_cookies, _log, limiter  # bestehende Helfer wiederverwenden

router = APIRouter(prefix="/api/auth/webauthn", tags=["webauthn"])

CHALLENGE_TTL_MINUTES = 5


async def _store_challenge(db: AsyncSession, challenge: bytes, purpose: str, user_id: str | None) -> str:
    token = secrets.token_urlsafe(32)
    db.add(WebAuthnChallenge(
        token=token, user_id=user_id, purpose=purpose,
        challenge=challenge.hex(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=CHALLENGE_TTL_MINUTES),
    ))
    await db.commit()
    return token


async def _consume_challenge(db: AsyncSession, token: str, purpose: str) -> WebAuthnChallenge:
    """Liest die Challenge und loescht sie sofort - Einmalgebrauch verhindert
    Replay-Angriffe mit einer alten Challenge."""
    row = await db.scalar(select(WebAuthnChallenge).where(WebAuthnChallenge.token == token))
    if not row or row.purpose != purpose:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anfrage ungültig oder abgelaufen")
    await db.delete(row)
    await db.commit()
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anfrage ist abgelaufen, bitte erneut versuchen")
    return row


@router.post("/register/options", dependencies=[Depends(verify_csrf)])
async def register_options(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.scalars(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
    exclude = [
        PublicKeyCredentialDescriptor(id=bytes.fromhex(c.credential_id))
        for c in existing.all()
    ]
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.APP_NAME,
        user_id=user.id.encode(),
        user_name=user.email,
        user_display_name=user.full_name,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    token = await _store_challenge(db, options.challenge, "registration", user.id)
    return {"token": token, "options": json_loads(options_to_json(options))}


@router.post("/register/verify", dependencies=[Depends(verify_csrf)])
async def register_verify(payload: WebAuthnRegisterVerify, request: Request,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await _consume_challenge(db, payload.token, "registration")
    if row.user_id != user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anfrage gehört nicht zu diesem Konto")

    try:
        credential = parse_registration_credential_json(payload.credential)
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=bytes.fromhex(row.challenge),
            expected_origin=settings.webauthn_origin,
            expected_rp_id=settings.webauthn_rp_id,
        )
    except InvalidRegistrationResponse as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Registrierung fehlgeschlagen: {e}")

    entry = WebAuthnCredential(
        user_id=user.id,
        credential_id=verification.credential_id.hex(),
        public_key=verification.credential_public_key.hex(),
        sign_count=verification.sign_count,
        device_type=verification.credential_device_type or "cross-platform",
        backed_up=bool(verification.credential_backed_up),
        nickname=payload.nickname.strip() or "Sicherheitsschlüssel",
    )
    db.add(entry)
    await _log(db, user.id, "passkey_registered", request)
    await db.commit()
    return {"ok": True}


@router.get("", response_model=list[PasskeyOut])
async def list_passkeys(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
        .order_by(WebAuthnCredential.created_at)
    )
    return list(rows.all())


@router.delete("/{credential_id}", dependencies=[Depends(verify_csrf)])
async def delete_passkey(credential_id: str, request: Request,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cred = await db.get(WebAuthnCredential, credential_id)
    if not cred or cred.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    await db.delete(cred)
    await _log(db, user.id, "passkey_removed", request)
    await db.commit()
    return {"ok": True}


@router.post("/login/options")
@limiter.limit("10/minute")
async def login_options(request: Request, payload: WebAuthnLoginOptionsRequest, db: AsyncSession = Depends(get_db)):
    """Absichtlich KEINE Auskunft darüber, ob die E-Mail existiert: ohne
    passendes Konto kommen einfach keine allowCredentials mit - der Browser
    zeigt dann von selbst "kein passender Schlüssel gefunden"."""
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    allow = []
    user_id = None
    if user and user.is_active:
        user_id = user.id
        creds = await db.scalars(select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id))
        allow = [PublicKeyCredentialDescriptor(id=bytes.fromhex(c.credential_id)) for c in creds.all()]

    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    token = await _store_challenge(db, options.challenge, "authentication", user_id)
    return {"token": token, "options": json_loads(options_to_json(options))}


@router.post("/login/verify")
@limiter.limit("10/minute")
async def login_verify(request: Request, payload: WebAuthnLoginVerify, db: AsyncSession = Depends(get_db)):
    row = await _consume_challenge(db, payload.token, "authentication")
    if not row.user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung fehlgeschlagen")

    user = await db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung fehlgeschlagen")

    try:
        credential = parse_authentication_credential_json(payload.credential)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültige Antwort des Sicherheitsschlüssels")

    cred = await db.scalar(
        select(WebAuthnCredential).where(
            WebAuthnCredential.credential_id == credential.raw_id.hex(),
            WebAuthnCredential.user_id == user.id,
        )
    )
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sicherheitsschlüssel nicht bekannt")

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=bytes.fromhex(row.challenge),
            expected_origin=settings.webauthn_origin,
            expected_rp_id=settings.webauthn_rp_id,
            credential_public_key=bytes.fromhex(cred.public_key),
            credential_current_sign_count=cred.sign_count,
        )
    except InvalidAuthenticationResponse as e:
        await _log(db, user.id, "login_failed_passkey", request)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Verifikation fehlgeschlagen: {e}")

    # Sign-Count-Anstieg erkennt geklonte Authenticatoren (Clone Detection);
    # ein Rueckschritt/Stillstand ist bei manchen Plattform-Authenticatoren normal.
    cred.sign_count = verification.new_sign_count
    cred.last_used_at = datetime.now(timezone.utc)

    access_token, expires_in = create_access_token(user.id, user.role.value)
    refresh_raw, refresh_hash = generate_refresh_token()
    from ..models import RefreshToken
    db.add(RefreshToken(
        user_id=user.id, token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else "",
    ))
    await _log(db, user.id, "login_success_passkey", request)
    await db.commit()

    response = _make_login_response(user)
    _set_auth_cookies(response, access_token, expires_in, refresh_raw)
    return response


def json_loads(s: str):
    import json
    return json.loads(s)


def _make_login_response(user: User):
    from fastapi.responses import JSONResponse
    from ..schemas import UserOut
    return JSONResponse(content={"user": json_loads(UserOut.model_validate(user).model_dump_json())})
