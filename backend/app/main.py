import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import settings
from .database import Base, engine, AsyncSessionLocal, get_db
from .models import User, Role, Desk, Floor
from .security import hash_password
from .schemas import PublicConfig
from .routers.settings import load_appearance
from .routers import auth, desks, bookings, floors, admin_users, scene, settings as settings_router, webauthn, chat, avatars, absences, audit
from .routers.auth import limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("deskbooking")


async def _wait_for_db(max_attempts: int = 30, delay_seconds: float = 2.0):
    """Wartet auf eine erreichbare Datenbank. depends_on/healthcheck decken den
    Normalfall bereits ab, aber bei automatischen Container-Neustarts durch
    restart:unless-stopped wird depends_on nicht erneut ausgewertet."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        except (OperationalError, OSError) as e:
            last_error = e
            logger.warning(
                "Datenbank noch nicht erreichbar (Versuch %d/%d): %s: %s",
                attempt, max_attempts, e.__class__.__name__, e,
            )
            await asyncio.sleep(delay_seconds)
    raise RuntimeError(f"Datenbank nach {max_attempts} Versuchen nicht erreichbar") from last_error


async def _run_migrations():
    """Ergaenzt Spalten, die in spaeteren Versionen dazugekommen sind.

    WICHTIG: Base.metadata.create_all() legt nur FEHLENDE TABELLEN an - es
    veraendert bestehende Tabellen NIE. Neue Spalten auf einer bereits
    existierenden Tabelle muessen daher explizit ergaenzt werden, sonst
    scheitert jede Abfrage mit "column ... does not exist".

    Alle Anweisungen sind idempotent (IF NOT EXISTS), koennen also bei jedem
    Start gefahrlos erneut laufen. Fuer groessere Schema-Aenderungen waere
    Alembic das richtige Werkzeug; fuer dieses ueberschaubare Projekt ist das
    hier bewusst die einfachere Loesung."""
    statements = [
        # v2: Zwei-Faktor-Authentifizierung
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        # v2: Notiz an einer Buchung
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS comment VARCHAR(280) NOT NULL DEFAULT ''",
        # v3: Zeitfenster (ganztags / vormittags / nachmittags).
        # Der Enum-Typ muss existieren, bevor die Spalte ihn nutzen kann.
        "DO $$ BEGIN CREATE TYPE bookingslot AS ENUM ('full','morning','afternoon'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slot bookingslot NOT NULL DEFAULT 'full'",
        # Alte Eindeutigkeit galt pro (Platz, Tag) - jetzt pro (Platz, Tag, Zeitfenster),
        # damit sich Vor- und Nachmittag denselben Platz teilen koennen.
        "ALTER TABLE bookings DROP CONSTRAINT IF EXISTS uq_desk_date_active",
        "DO $$ BEGIN ALTER TABLE bookings ADD CONSTRAINT uq_desk_date_slot "
        "UNIQUE (desk_id, booking_date, slot); "
        "EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$",
        # v4: Namens-Stil (Glitzer-Effekt) - rein kosmetisch.
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name_style VARCHAR(20) NOT NULL DEFAULT 'plain'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name_style_color VARCHAR(7) NOT NULL DEFAULT '#35E0C0'",
        # v5: Kapazitaet je Platz - >1 macht ihn zum Konferenztisch mit
        # Gruppen-Buchung (booking_attendees ist eine neue Tabelle, die
        # create_all() automatisch anlegt und daher hier nicht braucht).
        "ALTER TABLE desks ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 1",
        # v6: Profilbild (als Bytes in der DB, siehe User.avatar_url).
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(40)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ",
        # v7: Erwähnungen im Chat (@Name) + Admin-Moderation.
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_mention_seen_at TIMESTAMPTZ",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions VARCHAR(2000) NOT NULL DEFAULT ''",
        # v7: Urlaub/Abwesenheit - Tabelle "absences" ist neu und wird von
        # create_all() bereits automatisch angelegt, braucht hier kein ALTER.
        # v8: Konferenztische werden jetzt mit Uhrzeiten gebucht statt
        # ganztags/halbtags - dafuer koennen mehrere Buchungen pro Tag
        # denselben (ungenutzten) Slot-Wert teilen. Die alte 1-Buchung-pro-
        # Slot-Constraint muss deshalb weg; die Ueberschneidungspruefung
        # passiert jetzt vollstaendig im Router (siehe bookings.py).
        "ALTER TABLE bookings DROP CONSTRAINT IF EXISTS uq_desk_date_slot",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_time TIME",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_time TIME",
        # v9: Feste Zuweisung nur an bestimmten Wochentagen (z.B. Büro
        # Mo/Di/Do, Homeoffice Mi/Fr - an den Homeoffice-Tagen ist der Platz
        # frei buchbar). Default deckt das bisherige "immer fest" ab.
        "ALTER TABLE desks ADD COLUMN IF NOT EXISTS fixed_days VARCHAR(20) NOT NULL DEFAULT '0,1,2,3,4'",
        # v10: Online-Status im Chat (Heartbeat-basiert).
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
    ]
    async with engine.begin() as conn:
        for stmt in statements:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                # Einzelne Anweisung kann fehlschlagen, wenn die Tabelle noch
                # gar nicht existiert (Erstinstallation) - das ist unkritisch,
                # create_all() legt sie dann ohnehin vollstaendig an.
                logger.warning("Migration übersprungen (%s): %s", stmt.split(" ADD ")[0], e.__class__.__name__)


async def _seed():
    await _wait_for_db()
    await _run_migrations()

    async with AsyncSessionLocal() as db:
        existing_admin = await db.scalar(select(User).where(User.email == settings.ADMIN_EMAIL.lower()))
        if not existing_admin:
            # Fertigen Argon2-Hash bevorzugen, falls hinterlegt - so muss das
            # Admin-Passwort nie im Klartext in der .env stehen.
            pw_hash = settings.ADMIN_PASSWORD_HASH.strip() or hash_password(settings.ADMIN_PASSWORD)
            db.add(User(
                email=settings.ADMIN_EMAIL.lower(),
                full_name=settings.ADMIN_NAME,
                hashed_password=pw_hash,
                role=Role.admin,
            ))
            await db.commit()
            logger.info("Administrator-Konto angelegt: %s", settings.ADMIN_EMAIL)

        floor_count = await db.scalar(select(Floor))
        if floor_count is None:
            floor = Floor(name="1. OG", width=900, height=520)
            db.add(floor)
            await db.commit()
            await db.refresh(floor)
            # Beispiel-Layout: 12 Plaetze in einer 4x3-Anordnung, frei verschiebbar im Builder
            for i in range(12):
                col, row = i % 4, i // 4
                db.add(Desk(
                    name=f"D-{i + 1:02d}", floor_id=floor.id, zone="Open Space",
                    pos_x=80 + col * 180, pos_y=80 + row * 150,
                ))
            await db.commit()
            logger.info("Beispiel-Layout mit 12 Plaetzen angelegt.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starte Datenbank-Initialisierung...")
    await _seed()
    logger.info("Datenbank-Initialisierung abgeschlossen.")
    yield
    await engine.dispose()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "PUT"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Nur Header, die dein vorgeschaltetes Caddy (headers_common) NICHT bereits
    setzt. X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
    X-Frame-Options und Strict-Transport-Security kommen bei dir zentral aus
    Caddy - eine Dopplung hier wuerde nur redundante/potenziell widerspruechliche
    Header erzeugen (z.B. X-Frame-Options: SAMEORIGIN bei Caddy vs. DENY hier)."""
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    return response


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config", response_model=PublicConfig)
async def public_config(db: AsyncSession = Depends(get_db)):
    """Oeffentliche, nicht-sensible Konfiguration fuer das Frontend-Customizing.
    Reihenfolge: in der Oberflaeche gespeicherte Werte > .env-Vorgabe. Dadurch
    wirken Farbaenderungen sofort und ohne Rebuild oder Neustart."""
    return await load_appearance(db)


app.include_router(auth.router)
app.include_router(floors.router)
app.include_router(desks.router)
app.include_router(bookings.router)
app.include_router(scene.router)
app.include_router(settings_router.router)
app.include_router(webauthn.router)
app.include_router(chat.router)
app.include_router(admin_users.router)
app.include_router(avatars.router)
app.include_router(absences.router)
app.include_router(audit.router)
