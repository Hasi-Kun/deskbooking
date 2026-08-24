"""E-Mail-Benachrichtigungen (neue Direktnachricht / Erwähnung). Bewusst
denkbar einfach gehalten - kein Warteschlangen-System, kein Template-Motor,
nur ein synchroner SMTP-Versand in einem Thread (smtplib kann nicht async),
mit grosszuegigem Timeout und stillem Scheitern. Fuer ein internes Buero-Tool
mit ueberschaubarem Nachrichtenaufkommen reicht das voellig aus."""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText

from .config import settings

logger = logging.getLogger("deskbooking.email")


def is_email_configured() -> bool:
    return bool(settings.SMTP_HOST)


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)


async def send_notification_email(to: str, subject: str, body: str) -> bool:
    """Best-effort: schlaegt der Versand fehl (falsche Zugangsdaten, Server
    nicht erreichbar, ...), wird das nur geloggt - eine E-Mail-Panne darf
    niemals eine Buchung/Nachricht selbst scheitern lassen."""
    if not is_email_configured():
        return False
    try:
        await asyncio.wait_for(asyncio.to_thread(_send_sync, to, subject, body), timeout=15)
        return True
    except Exception as e:  # noqa: BLE001 - bewusst breit, Versand darf nie eskalieren
        logger.warning("E-Mail-Benachrichtigung an %s fehlgeschlagen: %s", to, e)
        return False
