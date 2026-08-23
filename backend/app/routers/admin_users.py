from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, Role, RefreshToken, BackupCode, AuditLog
from ..schemas import UserOut, AdminUserCreate, UserStatusOut, RoleUpdate, PasswordResetRequest
from ..security import hash_password
from ..deps import require_admin, verify_csrf

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


def _log(db: AsyncSession, admin: User, action: str, request: Request, entity_id: str = ""):
    """Kurzform fuers Audit-Log admin-seitiger Nutzerverwaltung - dieselbe
    Tabelle, die auch Logins/Buchungen protokolliert (siehe auth.py/bookings.py)."""
    db.add(AuditLog(user_id=admin.id, action=action, entity="user", entity_id=entity_id,
                     ip_address=request.client.host if request.client else ""))


@router.get("", response_model=list[UserStatusOut])
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Fuer die Zuweisungs-Auswahl im Layout-Builder (feste Plaetze) und Nutzerverwaltung."""
    result = await db.scalars(select(User).order_by(User.full_name))
    return result.all()


@router.post("", response_model=UserOut, dependencies=[Depends(verify_csrf)])
async def create_user(payload: AdminUserCreate, request: Request,
                       admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail-Adresse ist bereits registriert")

    role = Role.admin if payload.role == "admin" else Role.user
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    _log(db, admin, "user_created", request, user.id)
    await db.commit()
    return user


@router.delete("/{user_id}", dependencies=[Depends(verify_csrf)])
async def delete_user(user_id: str, request: Request,
                       admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Löscht das Konto endgültig (nicht nur deaktivieren). Buchungen,
    Nachrichten, Passkeys usw. hängen per ON DELETE CASCADE an users.id und
    verschwinden automatisch mit; Audit-Log-Einträge bleiben erhalten
    (dort ist die FK auf SET NULL gestellt) - die Historie geht also nicht
    verloren, nur der Bezug zur gelöschten Person."""
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Eigenes Konto kann nicht gelöscht werden")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    if user.role == Role.admin:
        remaining = await db.scalar(
            select(func.count()).select_from(User).where(User.role == Role.admin, User.id != user_id)
        )
        if not remaining:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Der letzte Administrator kann nicht gelöscht werden")
    # Name/E-Mail VOR dem Loeschen ins Log schreiben (action-Feld, nicht
    # entity_id) - danach ist ueber die user_id nichts mehr nachschlagbar.
    _log(db, admin, f"user_deleted:{user.full_name}", request, user_id)
    await db.delete(user)
    await db.commit()
    return {"ok": True}


@router.patch("/{user_id}/deactivate", dependencies=[Depends(verify_csrf)])
async def deactivate_user(user_id: str, request: Request,
                           admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Eigenes Konto kann nicht deaktiviert werden")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    user.is_active = False
    _log(db, admin, f"user_deactivated:{user.full_name}", request, user_id)
    await db.commit()
    return {"ok": True}


@router.patch("/{user_id}/activate", dependencies=[Depends(verify_csrf)])
async def activate_user(user_id: str, request: Request,
                         admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    user.is_active = True
    user.failed_login_attempts = 0
    user.locked_until = None
    _log(db, admin, f"user_activated:{user.full_name}", request, user_id)
    await db.commit()
    return {"ok": True}


@router.patch("/{user_id}/role", response_model=UserStatusOut, dependencies=[Depends(verify_csrf)])
async def change_role(user_id: str, payload: RoleUpdate, request: Request,
                       admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                             "Die eigene Rolle kann nicht geändert werden")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    user.role = Role.admin if payload.role == "admin" else Role.user
    _log(db, admin, f"user_role_changed:{user.full_name}->{payload.role}", request, user_id)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", dependencies=[Depends(verify_csrf)])
async def reset_password(user_id: str, payload: PasswordResetRequest, request: Request,
                          admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Setzt ein neues Passwort. Alle offenen Sitzungen des Nutzers werden
    widerrufen - sonst bliebe ein evtl. kompromittierter Zugang weiter gueltig."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    user.hashed_password = hash_password(payload.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    tokens = await db.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id))
    for t in tokens.all():
        t.revoked = True
    _log(db, admin, f"user_password_reset:{user.full_name}", request, user_id)
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/disable-2fa", dependencies=[Depends(verify_csrf)])
async def admin_disable_2fa(user_id: str, request: Request, admin: User = Depends(require_admin),
                             db: AsyncSession = Depends(get_db)):
    """Notfall-Entsperrung, wenn jemand sein Telefon verloren hat."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    user.totp_enabled = False
    user.totp_secret = None
    # Einmal-Codes gehoeren zum zweiten Faktor - beim Zuruecksetzen mit entfernen.
    stale = await db.scalars(select(BackupCode).where(BackupCode.user_id == user_id))
    for c in stale.all():
        await db.delete(c)
    _log(db, admin, f"user_2fa_disabled:{user.full_name}", request, user_id)
    await db.commit()
    return {"ok": True}
