from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Floor, User, AuditLog
from ..schemas import FloorOut, FloorCreate, FloorUpdate
from ..deps import get_current_user, require_admin, verify_csrf

router = APIRouter(prefix="/api/floors", tags=["floors"])


@router.get("", response_model=list[FloorOut])
async def list_floors(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(Floor).order_by(Floor.sort_order, Floor.name))
    return result.all()


@router.post("", response_model=FloorOut, dependencies=[Depends(verify_csrf)])
async def create_floor(payload: FloorCreate, request: Request,
                        admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    floor = Floor(**payload.model_dump())
    db.add(floor)
    await db.commit()
    await db.refresh(floor)
    db.add(AuditLog(user_id=admin.id, action=f"floor_created:{floor.name}", entity="floor",
                     entity_id=floor.id, ip_address=request.client.host if request.client else ""))
    await db.commit()
    return floor


@router.patch("/{floor_id}", response_model=FloorOut, dependencies=[Depends(verify_csrf)])
async def update_floor(floor_id: str, payload: FloorUpdate,
                        admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ebene nicht gefunden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(floor, field, value)
    await db.commit()
    await db.refresh(floor)
    return floor


@router.delete("/{floor_id}", dependencies=[Depends(verify_csrf)])
async def delete_floor(floor_id: str, request: Request,
                        admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Löscht die Ebene samt allem, was darauf liegt (Plätze, Einrichtung,
    Buchungen) - das übernehmen die vorhandenen ON DELETE CASCADE-Regeln bzw.
    die "delete-orphan"-Relationship auf Floor.desks/scene_objects. Bewusst
    kein Vorab-Check mehr, der das bei vorhandenen Plätzen verweigert - das
    Frontend holt vorher eine explizite Bestätigung ein."""
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ebene nicht gefunden")
    db.add(AuditLog(user_id=admin.id, action=f"floor_deleted:{floor.name}", entity="floor",
                     entity_id=floor_id, ip_address=request.client.host if request.client else ""))
    await db.delete(floor)
    await db.commit()
    return {"ok": True}
