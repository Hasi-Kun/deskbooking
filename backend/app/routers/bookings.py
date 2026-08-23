from datetime import date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Booking, Desk, User, BookingStatus, BookingSlot, BookingAttendee, AuditLog, Absence
from ..schemas import BookingCreate, BookingOut, BookingRangeCreate, AttendeeOut
from ..deps import get_current_user, verify_csrf

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


async def _desk_temporarily_free(db: AsyncSession, desk: Desk, on_date: date) -> bool:
    """Ein fest zugewiesener Platz gilt an diesem Tag als frei, wenn entweder
    (a) der Tag laut Desk.fixed_days kein "Büro-Tag" der zugewiesenen Person
    ist (z.B. ihr Homeoffice-Tag), oder (b) sie an dem Tag im Urlaub ist."""
    if not desk.fixed_user_id:
        return False
    fixed_days = {int(x) for x in desk.fixed_days.split(",") if x != ""}
    if on_date.weekday() not in fixed_days:
        return True
    hit = await db.scalar(
        select(Absence).where(
            Absence.user_id == desk.fixed_user_id,
            Absence.date_from <= on_date, Absence.date_to >= on_date,
        )
    )
    return hit is not None


def _parse_slot(value: str) -> BookingSlot:
    try:
        return BookingSlot(value)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                             "Zeitfenster muss full, morning oder afternoon sein")


def _parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def _conflicting_slots(slot: BookingSlot) -> list[BookingSlot]:
    """Welche vorhandenen Zeitfenster blockieren das gewuenschte?
    Ganztags kollidiert mit allem; ein Halbtag mit sich selbst und mit ganztags."""
    if slot == BookingSlot.full:
        return [BookingSlot.full, BookingSlot.morning, BookingSlot.afternoon]
    return [BookingSlot.full, slot]


SLOT_LABEL = {
    BookingSlot.full: "ganztags",
    BookingSlot.morning: "vormittags",
    BookingSlot.afternoon: "nachmittags",
}


def _to_out(b: Booking) -> BookingOut:
    attendees = [
        AttendeeOut(id=a.user.id, full_name=a.user.full_name,
                    name_style=a.user.name_style, name_style_color=a.user.name_style_color)
        for a in (b.attendees or [])
    ]
    return BookingOut(
        id=b.id, desk_id=b.desk_id, desk_name=b.desk.name,
        user_id=b.user_id, user_name=b.user.full_name,
        user_name_style=b.user.name_style, user_name_style_color=b.user.name_style_color,
        booking_date=b.booking_date, status=b.status.value,
        slot=b.slot.value if b.slot else "full",
        start_time=b.start_time.strftime("%H:%M") if b.start_time else None,
        end_time=b.end_time.strftime("%H:%M") if b.end_time else None,
        comment=b.comment or "", attendees=attendees, created_at=b.created_at,
    )


async def _resolve_attendees(db: AsyncSession, desk: Desk, booker_id: str, attendee_ids: list[str]) -> list[User]:
    """Prueft und laedt die zusaetzlichen Teilnehmenden einer Gruppenbuchung.
    Nur fuer Tische mit Kapazitaet > 1 relevant - ein normaler Einzelplatz
    ignoriert eine evtl. mitgeschickte Liste ohnehin (siehe Aufrufer)."""
    ids = [i for i in dict.fromkeys(attendee_ids) if i and i != booker_id]  # Duplikate + Booker selbst raus
    if not ids:
        return []
    if len(ids) + 1 > desk.capacity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"„{desk.name}“ bietet Platz für {desk.capacity} Personen, {len(ids) + 1} wurden angegeben",
        )
    rows = await db.scalars(select(User).where(User.id.in_(ids), User.is_active.is_(True)))
    users = list(rows.all())
    if len(users) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mindestens ein ausgewählter Teilnehmer wurde nicht gefunden")
    return users


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
        .options(
            selectinload(Booking.desk), selectinload(Booking.user),
            selectinload(Booking.attendees).selectinload(BookingAttendee.user),
        )
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
        .options(
            selectinload(Booking.desk), selectinload(Booking.user),
            selectinload(Booking.attendees).selectinload(BookingAttendee.user),
        )
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
    if desk.fixed_user_id and not await _desk_temporarily_free(db, desk, payload.booking_date):
        raise HTTPException(status.HTTP_409_CONFLICT, "Dieser Platz ist fest zugewiesen und nicht buchbar")

    # Zusaetzliche Teilnehmende validieren, BEVOR die Buchung angelegt wird -
    # so entsteht bei einem ungueltigen Teilnehmer keine halbe Buchung.
    attendees = await _resolve_attendees(db, desk, user.id, payload.attendee_ids)

    if desk.capacity > 1:
        # Konferenztisch: Uhrzeitfenster statt ganztags/halbtags - mehrere,
        # zeitlich getrennte Meetings pro Tag sind moeglich.
        if not payload.start_time or not payload.end_time:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte Start- und Endzeit angeben")
        start_t = _parse_hhmm(payload.start_time)
        end_t = _parse_hhmm(payload.end_time)
        if end_t <= start_t:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Endzeit muss nach der Startzeit liegen")

        overlap = await db.scalar(
            select(Booking).where(
                Booking.desk_id == desk.id,
                Booking.booking_date == payload.booking_date,
                Booking.status == BookingStatus.confirmed,
                Booking.start_time < end_t, Booking.end_time > start_t,
            )
        )
        if overlap:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Der Tisch ist von {overlap.start_time.strftime('%H:%M')} bis "
                f"{overlap.end_time.strftime('%H:%M')} bereits belegt",
            )

        # Ausnahme-Regel: gibt es mehrere Konferenztische, kann trotzdem
        # jede Person nur an EINEM gleichzeitig sitzen - unabhaengig davon,
        # in welchem Raum. Deshalb auch ueber alle anderen Konferenztische
        # hinweg auf eine zeitliche Ueberschneidung der eigenen Buchungen pruefen.
        own_meeting_overlap = await db.scalar(
            select(Booking).join(Desk, Booking.desk_id == Desk.id).where(
                Booking.user_id == user.id,
                Booking.booking_date == payload.booking_date,
                Booking.status == BookingStatus.confirmed,
                Desk.capacity > 1,
                Booking.start_time < end_t, Booking.end_time > start_t,
            )
        )
        if own_meeting_overlap:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Du hast für diesen Zeitraum bereits einen anderen Konferenztisch gebucht",
            )

        booking = Booking(desk_id=desk.id, user_id=user.id, booking_date=payload.booking_date,
                           slot=BookingSlot.full, start_time=start_t, end_time=end_t,
                           comment=payload.comment.strip())
    else:
        slot = _parse_slot(payload.slot)
        blocking = _conflicting_slots(slot)

        # Ist der Platz im gewuenschten Zeitfenster schon vergeben?
        taken = await db.scalar(
            select(Booking).where(
                Booking.desk_id == desk.id,
                Booking.booking_date == payload.booking_date,
                Booking.status == BookingStatus.confirmed,
                Booking.slot.in_(blocking),
            )
        )
        if taken:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Dieser Platz ist an dem Tag bereits {SLOT_LABEL[taken.slot]} belegt",
            )

        # Ein Nutzer darf sich nicht selbst doppelt einbuchen (gleiches Zeitfenster).
        own = await db.scalar(
            select(Booking).where(
                Booking.user_id == user.id,
                Booking.booking_date == payload.booking_date,
                Booking.status == BookingStatus.confirmed,
                Booking.slot.in_(blocking),
            )
        )
        if own:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Du hast für diesen Tag bereits {SLOT_LABEL[own.slot]} einen Platz gebucht",
            )

        booking = Booking(desk_id=desk.id, user_id=user.id, booking_date=payload.booking_date,
                           slot=slot, comment=payload.comment.strip())

    db.add(booking)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Dieser Platz ist für den gewählten Zeitraum bereits belegt")

    for a in attendees:
        db.add(BookingAttendee(booking_id=booking.id, user_id=a.id))
    if attendees:
        await db.commit()

    await db.refresh(booking, attribute_names=["desk", "user", "attendees"])
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
    if desk.capacity > 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Konferenztische werden mit Uhrzeiten für einzelne Tage gebucht, nicht als Zeitraum",
        )

    slot = _parse_slot(payload.slot)
    blocking = _conflicting_slots(slot)
    attendees = await _resolve_attendees(db, desk, user.id, payload.attendee_ids)

    today = date.today()
    created: list[str] = []
    skipped: list[str] = []

    current = payload.date_from
    while current <= payload.date_to:
        # Wochenenden optional ueberspringen (Mo=0 ... So=6)
        if current < today or (payload.skip_weekends and current.weekday() >= 5):
            current += timedelta(days=1)
            continue

        # Fest zugewiesene Tage (Büro-Tage der Person) werden übersprungen
        # statt die ganze Aktion abzulehnen - so lässt sich ein Zeitraum über
        # Homeoffice-Tage/Urlaub hinweg buchen, ohne Büro-Tage zu verletzen.
        if desk.fixed_user_id and not await _desk_temporarily_free(db, desk, current):
            skipped.append(current.isoformat())
            current += timedelta(days=1)
            continue

        clash = await db.scalar(
            select(Booking).where(
                Booking.booking_date == current,
                Booking.status == BookingStatus.confirmed,
                Booking.slot.in_(blocking),
                or_(Booking.desk_id == desk.id, Booking.user_id == user.id),
            )
        )
        if clash:
            skipped.append(current.isoformat())
        else:
            booking = Booking(desk_id=desk.id, user_id=user.id, booking_date=current,
                               slot=slot, comment=payload.comment.strip())
            db.add(booking)
            try:
                await db.commit()
                for a in attendees:
                    db.add(BookingAttendee(booking_id=booking.id, user_id=a.id))
                if attendees:
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
