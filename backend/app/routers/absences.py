"""Urlaub/Abwesenheit. Bewusst für alle angemeldeten Personen lesbar (nicht
nur Admins) - jede Person muss sehen können, ob ein fester Platz gerade
wegen Urlaub frei ist, um ihn zu buchen. Nur das Anlegen/Löschen ist auf die
eigenen Einträge beschränkt (Admins zusätzlich auf alle)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import get_current_user, verify_csrf
from ..models import Absence, User, Role
from ..schemas import AbsenceCreate, AbsenceOut

router = APIRouter(prefix="/api/absences", tags=["absences"])


def _to_out(a: Absence) -> AbsenceOut:
    return AbsenceOut(id=a.id, user_id=a.user_id, user_name=a.user.full_name,
                       date_from=a.date_from, date_to=a.date_to)


@router.get("", response_model=list[AbsenceOut])
async def list_absences(
    date_from: date = Query(...), date_to: date = Query(...),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Alle Abwesenheiten, die sich mit dem angefragten Zeitraum überschneiden -
    Grundlage dafür, feste Plätze an dem Tag ggf. als frei anzuzeigen."""
    stmt = (
        select(Absence)
        .where(Absence.date_from <= date_to, Absence.date_to >= date_from)
        .options(selectinload(Absence.user))
    )
    rows = (await db.scalars(stmt)).all()
    return [_to_out(a) for a in rows]


@router.get("/mine", response_model=list[AbsenceOut])
async def my_absences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Absence)
        .where(Absence.user_id == user.id, Absence.date_to >= date.today())
        .options(selectinload(Absence.user))
        .order_by(Absence.date_from)
    )
    rows = (await db.scalars(stmt)).all()
    return [_to_out(a) for a in rows]


@router.post("", response_model=AbsenceOut, dependencies=[Depends(verify_csrf)])
async def create_absence(payload: AbsenceCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if payload.date_to < payload.date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enddatum liegt vor dem Startdatum")
    if (payload.date_to - payload.date_from).days > 90:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zeitraum ist auf 90 Tage begrenzt")
    absence = Absence(user_id=user.id, date_from=payload.date_from, date_to=payload.date_to)
    db.add(absence)
    await db.commit()
    await db.refresh(absence, attribute_names=["user"])
    return _to_out(absence)


@router.delete("/{absence_id}", dependencies=[Depends(verify_csrf)])
async def delete_absence(absence_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    absence = await db.get(Absence, absence_id)
    if not absence:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eintrag nicht gefunden")
    if absence.user_id != user.id and user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur eigene Einträge können gelöscht werden")
    await db.delete(absence)
    await db.commit()
    return {"ok": True}
