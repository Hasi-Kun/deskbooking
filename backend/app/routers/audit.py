"""Aktivitäten-Log fürs Admin-Menüband. Liest ausschließlich die bereits
bestehende audit_log-Tabelle - geschrieben wird dort schon lange aus
auth.py (Logins/2FA/Passwort), bookings.py (Buchungen) und admin_users.py/
floors.py (Nutzerverwaltung, Ebenen). Dieser Router fügt nur die Leseseite
hinzu."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import AuditLog, User
from ..schemas import AuditLogOut
from ..deps import require_admin

router = APIRouter(prefix="/api/admin/audit-log", tags=["admin"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit_log(
    limit: int = Query(default=60, le=200),
    before: datetime | None = Query(default=None, description="Nur Einträge VOR diesem Zeitpunkt (Pagination)"),
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditLog).options(selectinload(AuditLog.user)).order_by(AuditLog.timestamp.desc())
    if before:
        stmt = stmt.where(AuditLog.timestamp < before)
    stmt = stmt.limit(limit)
    rows = (await db.scalars(stmt)).all()
    return [
        AuditLogOut(
            id=a.id, action=a.action, entity=a.entity, entity_id=a.entity_id,
            ip_address=a.ip_address, timestamp=a.timestamp,
            user_id=a.user_id, user_name=a.user.full_name if a.user else None,
        )
        for a in rows
    ]
