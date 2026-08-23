"""Profilbilder. Werden als Bytes in der users-Tabelle gespeichert (siehe
Migration in main.py und User.avatar_url) statt im Dateisystem - der
Frontend-Container hat kein persistentes Volume, ein Upload dort waere beim
naechsten Rebuild wieder weg. Fuer die ueberschaubare Groesse eines
Profilbilds ist das voellig ausreichend.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user, verify_csrf
from ..models import User

router = APIRouter(tags=["avatars"])

ALLOWED_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}
MAX_BYTES = 2 * 1024 * 1024  # 2 MB reichen fuer ein Profilbild bei weitem


@router.post("/api/account/avatar", dependencies=[Depends(verify_csrf)])
async def upload_avatar(
    file: UploadFile,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nur PNG, JPEG, WebP oder GIF sind erlaubt")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bild ist zu groß (max. 2 MB)")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei ist leer")

    user.avatar_data = data
    user.avatar_mime = file.content_type
    user.avatar_updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return {"avatar_url": user.avatar_url}


@router.delete("/api/account/avatar", dependencies=[Depends(verify_csrf)])
async def delete_avatar(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.avatar_data = None
    user.avatar_mime = None
    user.avatar_updated_at = None
    await db.commit()
    return {"ok": True}


@router.get("/api/users/{user_id}/avatar")
async def get_avatar(
    user_id: str,
    # Nur angemeldete Kolleg:innen sehen Profilbilder - kein oeffentlicher
    # Endpunkt, das Tool ist ja nicht fuers offene Internet gedacht.
    _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target or not target.avatar_data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein Profilbild vorhanden")
    return Response(
        content=target.avatar_data,
        media_type=target.avatar_mime or "image/png",
        # Die URL traegt bereits einen Zeitstempel als Query-Parameter -
        # ein neues Bild bekommt automatisch eine neue URL, "immutable" ist
        # daher gefahrlos und spart wiederholte Downloads.
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
