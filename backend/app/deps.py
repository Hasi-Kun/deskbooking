from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .database import get_db
from .security import decode_access_token
from .models import User, Role


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nicht angemeldet")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sitzung abgelaufen, bitte erneut anmelden")

    user = await db.scalar(select(User).where(User.id == payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Konto nicht verfuegbar")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur fuer Administratoren")
    return user


def verify_csrf(request: Request):
    """Double-Submit-Cookie-Pattern: Header-Token muss mit Cookie-Token uebereinstimmen.
    Schuetzt zusaetzlich zu SameSite=strict gegen CSRF bei zustandsaendernden Requests."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF-Pruefung fehlgeschlagen")
