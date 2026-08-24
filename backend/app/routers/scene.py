from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import SceneObject, ObjectKind, User, AuditLog
from ..schemas import SceneObjectOut, SceneObjectCreate, SceneObjectUpdate
from ..deps import get_current_user, require_admin, verify_csrf

router = APIRouter(prefix="/api/scene", tags=["scene"])

OBJECT_LABEL = {
    "wall": "Wand", "window": "Fenster", "door": "Tür", "plant": "Pflanze",
    "cabinet": "Schrank", "meeting_table": "Besprechungstisch", "label": "Beschriftung",
}


def _log(db: AsyncSession, admin: User, action: str, request: Request, entity_id: str = ""):
    db.add(AuditLog(user_id=admin.id, action=action, entity="scene_object", entity_id=entity_id,
                     ip_address=request.client.host if request.client else ""))


def _parse_kind(value: str) -> ObjectKind:
    try:
        return ObjectKind(value)
    except ValueError:
        allowed = ", ".join(k.value for k in ObjectKind)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unbekannter Objekttyp. Erlaubt: {allowed}")


@router.get("", response_model=list[SceneObjectOut])
async def list_objects(floor_id: str | None = Query(default=None),
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(SceneObject)
    if floor_id:
        stmt = stmt.where(SceneObject.floor_id == floor_id)
    result = await db.scalars(stmt)
    return result.all()


@router.post("", response_model=SceneObjectOut, dependencies=[Depends(verify_csrf)])
async def create_object(payload: SceneObjectCreate, request: Request, admin: User = Depends(require_admin),
                         db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    data["kind"] = _parse_kind(data["kind"])
    obj = SceneObject(**data)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    _log(db, admin, f"object_created:{OBJECT_LABEL.get(obj.kind.value, obj.kind.value)}", request, obj.id)
    await db.commit()
    return obj


@router.patch("/{object_id}", response_model=SceneObjectOut, dependencies=[Depends(verify_csrf)])
async def update_object(object_id: str, payload: SceneObjectUpdate,
                         admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    obj = await db.get(SceneObject, object_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Objekt nicht gefunden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{object_id}", dependencies=[Depends(verify_csrf)])
async def delete_object(object_id: str, request: Request, admin: User = Depends(require_admin),
                         db: AsyncSession = Depends(get_db)):
    obj = await db.get(SceneObject, object_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Objekt nicht gefunden")
    _log(db, admin, f"object_removed:{OBJECT_LABEL.get(obj.kind.value, obj.kind.value)}", request, object_id)
    await db.delete(obj)
    await db.commit()
    return {"ok": True}
