from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Booking, Desk, User, BookingStatus, AuditLog
from ..schemas import BookingCreate, BookingOut, BookingRangeCreate
from ..deps import get_current_user, verify_csrf

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _to_out(b: Booking) -> BookingOut:
    return BookingOut(
        id=b.id, desk_id=b.desk_id, desk_name=b.desk.name,
        user_id=b.user_id, user_name=b.user.full_name,
        booking_date=b.booking_date, status=b.status.value,
        comment=b.comment or "", created_at=b.created_at,
    )


@router.get("", response_model=list[BookingOut])
async def list_bookings(
    date_from: date = Query(default_factory=date.today),
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Zeigt alle aktiven Buchungen im Zeitraum - Grundlage fuer die Belegungs-Uebersicht."""
    date_to = date_to or (date_from + timedelta(days=6))
    stmt = (
        select(Booking)
        .options(selectinload(Booking.desk), selectinload(Booking.user))
        .where(
            Booking.status == BookingStatus.confirmed,
            Booking.booking_date >= date_from,
            Booking.booking_date <= date_to,
        )
    )
    result = await db.scalars(stmt)
    return [_to_out(b) for b in result.all()]


@router.get("/mine", response_model=list[BookingOut])
async def my_bookings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Booking)
        .options(selectinload(Booking.desk), selectinload(Booking.user))
        .where(Booking.user_id == user.id, Booking.status == BookingStatus.confirmed,
               Booking.booking_date >= date.today())
        .order_by(Booking.booking_date)
    )
    result = await db.scalars(stmt)
    return [_to_out(b) for b in result.all()]


@router.post("", response_model=BookingOut, dependencies=[Depends(verify_csrf)])
async def create_booking(payload: BookingCreate, request: Request,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if payload.booking_date < date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Buchungen in der Vergangenheit sind nicht möglich")

    desk = await db.get(Desk, payload.desk_id)
    if not desk or not desk.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platz nicht verfügbar")
    if desk.fixed_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Dieser Platz ist fest zugewiesen und nicht buchbar")

    # Ein Nutzer darf pro Tag nur einen aktiven Platz haben
    existing = await db.scalar(
        select(Booking).where(
            Booking.user_id == user.id,
            Booking.booking_date == payload.booking_date,
            Booking.status == BookingStatus.confirmed,
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Du hast für diesen Tag bereits einen Platz gebucht")

    booking = Booking(desk_id=desk.id, user_id=user.id, booking_date=payload.booking_date,
                       comment=payload.comment.strip())
    db.add(booking)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Dieser Platz ist für den gewählten Tag bereits belegt")

    await db.refresh(booking, attribute_names=["desk", "user"])
    db.add(AuditLog(user_id=user.id, action="booking_create", entity="booking", entity_id=booking.id,
                     ip_address=request.client.host if request.client else ""))
    await db.commit()
    return _to_out(booking)


@router.delete("/{booking_id}", dependencies=[Depends(verify_csrf)])
async def cancel_booking(booking_id: str, request: Request,
                          user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buchung nicht gefunden")
    if booking.user_id != user.id and user.role.value != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur eigene Buchungen können storniert werden")

    await db.delete(booking)
    await db.commit()
    db.add(AuditLog(user_id=user.id, action="booking_cancel", entity="booking", entity_id=booking_id,
                     ip_address=request.client.host if request.client else ""))
    await db.commit()
    return {"ok": True}


@router.post("/range", dependencies=[Depends(verify_csrf)])
async def create_booking_range(payload: BookingRangeCreate, request: Request,
                                user: User = Depends(get_current_user),
                                db: AsyncSession = Depends(get_db)):
    """Bucht denselben Platz fuer einen ganzen Zeitraum. Tage, die bereits
    belegt sind (vom Nutzer selbst oder von anderen), werden uebersprungen und
    im Ergebnis gemeldet - so scheitert nicht die ganze Aktion an einem Tag."""
    if payload.date_to < payload.date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enddatum liegt vor dem Startdatum")
    if (payload.date_to - payload.date_from).days > 92:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zeitraum ist auf 92 Tage begrenzt")

    desk = await db.get(Desk, payload.desk_id)
    if not desk or not desk.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platz nicht verfügbar")
    if desk.fixed_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Dieser Platz ist fest zugewiesen und nicht buchbar")

    today = date.today()
    created: list[str] = []
    skipped: list[str] = []

    current = payload.date_from
    while current <= payload.date_to:
        # Wochenenden optional ueberspringen (Mo=0 ... So=6)
        if current < today or (payload.skip_weekends and current.weekday() >= 5):
            current += timedelta(days=1)
            continue

        clash = await db.scalar(
            select(Booking).where(
                Booking.booking_date == current,
                Booking.status == BookingStatus.confirmed,
                or_(Booking.desk_id == desk.id, Booking.user_id == user.id),
            )
        )
        if clash:
            skipped.append(current.isoformat())
        else:
            db.add(Booking(desk_id=desk.id, user_id=user.id, booking_date=current,
                           comment=payload.comment.strip()))
            try:
                await db.commit()
                created.append(current.isoformat())
            except IntegrityError:
                await db.rollback()
                skipped.append(current.isoformat())
        current += timedelta(days=1)

    db.add(AuditLog(user_id=user.id, action="booking_create_range", entity="booking",
                     entity_id=desk.id, ip_address=request.client.host if request.client else ""))
    await db.commit()
    return {"created": created, "skipped": skipped}
