from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Desk, User
from ..schemas import DeskOut, DeskCreate, DeskUpdate
from ..deps import get_current_user, require_admin, verify_csrf

router = APIRouter(prefix="/api/desks", tags=["desks"])


def _to_out(d: Desk) -> DeskOut:
    return DeskOut(
        id=d.id, name=d.name, floor_id=d.floor_id, zone=d.zone,
        pos_x=d.pos_x, pos_y=d.pos_y, is_active=d.is_active,
        fixed_user_id=d.fixed_user_id,
        fixed_user_name=d.fixed_user.full_name if d.fixed_user else None,
        fixed_user_style=d.fixed_user.name_style if d.fixed_user else "plain",
        fixed_user_style_color=d.fixed_user.name_style_color if d.fixed_user else "#35E0C0",
        capacity=d.capacity,
    )


@router.get("", response_model=list[DeskOut])
async def list_desks(floor_id: str | None = Query(default=None),
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Desk).options(selectinload(Desk.fixed_user))
    if floor_id:
        stmt = stmt.where(Desk.floor_id == floor_id)
    result = await db.scalars(stmt)
    return [_to_out(d) for d in result.all()]


@router.post("", response_model=DeskOut, dependencies=[Depends(verify_csrf)])
async def create_desk(payload: DeskCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    desk = Desk(**payload.model_dump())
    db.add(desk)
    await db.commit()
    await db.refresh(desk, attribute_names=["fixed_user"])
    return _to_out(desk)


@router.patch("/{desk_id}", response_model=DeskOut, dependencies=[Depends(verify_csrf)])
async def update_desk(desk_id: str, payload: DeskUpdate,
                       admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    desk = await db.get(Desk, desk_id)
    if not desk:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platz nicht gefunden")

    data = payload.model_dump(exclude_unset=True, exclude={"clear_fixed_user"})
    if payload.clear_fixed_user:
        data["fixed_user_id"] = None
    elif data.get("fixed_user_id") == "":
        data["fixed_user_id"] = None

    if "fixed_user_id" in data and data["fixed_user_id"]:
        target = await db.get(User, data["fixed_user_id"])
        if not target:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nutzer für feste Zuweisung nicht gefunden")

    for field, value in data.items():
        setattr(desk, field, value)

    await db.commit()
    await db.refresh(desk, attribute_names=["fixed_user"])
    return _to_out(desk)


@router.delete("/{desk_id}", dependencies=[Depends(verify_csrf)])
async def delete_desk(desk_id: str, hard: bool = Query(default=False),
                       admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """hard=true entfernt den Platz endgueltig (z.B. im Layout-Builder angelegt und
    versehentlich falsch platziert). Ohne hard wird der Platz nur deaktiviert -
    er bleibt im Layout sichtbar (ausgegraut), taucht aber nicht mehr im
    Buchungspool der Nutzer auf."""
    desk = await db.get(Desk, desk_id)
    if not desk:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platz nicht gefunden")
    if hard:
        await db.delete(desk)
    else:
        desk.is_active = False
    await db.commit()
    return {"ok": True}
