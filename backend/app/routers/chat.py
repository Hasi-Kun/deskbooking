"""Chat: ein globaler Kanal fuer alle sowie Direktnachrichten zwischen zwei
Personen. Bewusst auf Polling ausgelegt (kein WebSocket-Server) - das
Frontend fragt in Intervallen "gibt es Neues seit X" ab. Für ein internes
Buero-Tool reicht das; die Komplexität eines Realtime-Layers waere hier nicht
gerechtfertigt.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user, verify_csrf, require_admin
from ..models import Message, User
from ..schemas import MessageCreate, MessageOut, ConversationOut, DirectoryUser

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _mentions_csv(ids: list[str]) -> str:
    """",id1,id2," - siehe Kommentar am Message-Modell zum Substring-Check."""
    uniq = list(dict.fromkeys(i for i in ids if i))
    return ("," + ",".join(uniq) + ",") if uniq else ""


def _mentions_list(csv: str) -> list[str]:
    return [i for i in csv.split(",") if i]


async def _resolve_mentions(db: AsyncSession, ids: list[str]) -> list[str]:
    if not ids:
        return []
    rows = await db.scalars(select(User.id).where(User.id.in_(ids), User.is_active.is_(True)))
    return list(rows.all())


@router.get("/directory", response_model=list[DirectoryUser])
async def directory(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Aktive Kolleg:innen (außer sich selbst) für die Personenwahl im Chat.
    Bewusst ein eigener, für alle zugänglicher Endpunkt statt /api/admin/users -
    letzterer ist zu Recht auf Admins beschränkt."""
    rows = await db.scalars(
        select(User).where(User.is_active.is_(True), User.id != user.id).order_by(User.full_name)
    )
    return list(rows.all())


def _to_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id, channel=m.channel, sender_id=m.sender_id,
        sender_name=m.sender.full_name, sender_name_style=m.sender.name_style,
        sender_name_style_color=m.sender.name_style_color, sender_avatar_url=m.sender.avatar_url,
        sender_online=m.sender.online,
        recipient_id=m.recipient_id, body=m.body, mentioned_user_ids=_mentions_list(m.mentions),
        created_at=m.created_at,
    )


@router.get("/global", response_model=list[MessageOut])
async def global_messages(
    after: datetime | None = Query(default=None, description="Nur Nachrichten NACH diesem Zeitpunkt (fuer Polling)"),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    stmt = select(Message).where(Message.channel == "global").options(selectinload(Message.sender))
    if after:
        stmt = stmt.where(Message.created_at > after)
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
    rows = (await db.scalars(stmt)).all()
    return [_to_out(m) for m in reversed(rows)]


@router.post("/global", response_model=MessageOut, dependencies=[Depends(verify_csrf)])
async def send_global(payload: MessageCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    mentioned = await _resolve_mentions(db, payload.mentioned_user_ids)
    msg = Message(channel="global", sender_id=user.id, recipient_id=None, body=payload.body.strip(),
                  mentions=_mentions_csv(mentioned))
    db.add(msg)
    await db.commit()
    await db.refresh(msg, attribute_names=["sender"])
    return _to_out(msg)


@router.delete("/messages/{message_id}", dependencies=[Depends(verify_csrf)])
async def delete_message(message_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin-Moderation: eine einzelne Nachricht entfernen (global oder DM)."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    await db.delete(msg)
    await db.commit()
    return {"ok": True}


@router.delete("/global", dependencies=[Depends(verify_csrf)])
async def clear_global(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin-Moderation: den gesamten globalen Kanal leeren."""
    await db.execute(Message.__table__.delete().where(Message.channel == "global"))
    await db.commit()
    return {"ok": True}


@router.get("/mentions/unread-count")
async def mentions_unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Badge am Chat-Reiter - NUR eigene Erwähnungen seit dem letzten Ansehen,
    nicht der ganze ungelesene globale Kanal."""
    since = user.last_mention_seen_at
    stmt = select(func.count(Message.id)).where(
        Message.channel == "global", Message.mentions.contains(f",{user.id},")
    )
    if since:
        stmt = stmt.where(Message.created_at > since)
    n = await db.scalar(stmt)
    return {"unread": n or 0}


@router.post("/mentions/seen", dependencies=[Depends(verify_csrf)])
async def mark_mentions_seen(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.last_mention_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Eine Zeile pro Gesprächspartner: letzte Nachricht + Anzahl ungelesener."""
    stmt = (
        select(Message)
        .where(Message.channel == "dm", or_(Message.sender_id == user.id, Message.recipient_id == user.id))
        .options(selectinload(Message.sender), selectinload(Message.recipient))
        .order_by(Message.created_at.desc())
    )
    rows = (await db.scalars(stmt)).all()

    seen: dict[str, ConversationOut] = {}
    unread: dict[str, int] = {}
    for m in rows:
        other = m.recipient if m.sender_id == user.id else m.sender
        if not other:
            continue
        if m.recipient_id == user.id and not m.read_at:
            unread[other.id] = unread.get(other.id, 0) + 1
        if other.id not in seen:
            seen[other.id] = ConversationOut(
                user_id=other.id, user_name=other.full_name,
                user_name_style=other.name_style, user_name_style_color=other.name_style_color,
                user_avatar_url=other.avatar_url, user_online=other.online,
                last_message=m.body, last_at=m.created_at, unread=0,
            )
    for conv in seen.values():
        conv.unread = unread.get(conv.user_id, 0)
    return sorted(seen.values(), key=lambda c: c.last_at, reverse=True)


@router.get("/dm/{other_id}", response_model=list[MessageOut])
async def dm_messages(
    other_id: str,
    after: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    other = await db.get(User, other_id)
    if not other:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")

    stmt = (
        select(Message)
        .where(
            Message.channel == "dm",
            or_(
                and_(Message.sender_id == user.id, Message.recipient_id == other_id),
                and_(Message.sender_id == other_id, Message.recipient_id == user.id),
            ),
        )
        .options(selectinload(Message.sender))
    )
    if after:
        stmt = stmt.where(Message.created_at > after)
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
    rows = (await db.scalars(stmt)).all()

    # Beim Abrufen als gelesen markieren (nur die, die an mich gingen)
    unread_ids = [m.id for m in rows if m.recipient_id == user.id and not m.read_at]
    if unread_ids:
        await db.execute(
            Message.__table__.update()
            .where(Message.id.in_(unread_ids))
            .values(read_at=datetime.now(timezone.utc))
        )
        await db.commit()

    return [_to_out(m) for m in reversed(rows)]


@router.post("/dm/{other_id}", response_model=MessageOut, dependencies=[Depends(verify_csrf)])
async def send_dm(other_id: str, payload: MessageCreate, request: Request,
                   user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if other_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nachricht kann nicht an sich selbst gesendet werden")
    other = await db.get(User, other_id)
    if not other or not other.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")

    msg = Message(channel="dm", sender_id=user.id, recipient_id=other_id, body=payload.body.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg, attribute_names=["sender"])
    return _to_out(msg)


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Für ein kleines Badge im Menü - Gesamtzahl ungelesener Direktnachrichten."""
    n = await db.scalar(
        select(func.count(Message.id)).where(
            Message.channel == "dm", Message.recipient_id == user.id, Message.read_at.is_(None)
        )
    )
    return {"unread": n or 0}
