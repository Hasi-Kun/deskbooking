import re
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..config import settings
from ..models import AppSetting, User
from ..schemas import PublicConfig, AppearanceUpdate
from ..deps import require_admin, verify_csrf

router = APIRouter(prefix="/api/settings", tags=["settings"])

HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# Welche Schluessel es gibt und woher der Standardwert kommt, wenn in der
# Datenbank nichts hinterlegt ist.
DEFAULTS = {
    "app_name": lambda: settings.APP_NAME,
    "primary_color": lambda: settings.PRIMARY_COLOR,
    "gradient_from": lambda: settings.GRADIENT_FROM,
    "gradient_mid": lambda: settings.GRADIENT_MID,
    "gradient_to": lambda: settings.GRADIENT_TO,
    "gradient_enabled": lambda: "1" if settings.GRADIENT_ENABLED else "0",
    "ambient_color": lambda: settings.AMBIENT_COLOR,
    "logo_url": lambda: settings.LOGO_URL,
    "support_contact": lambda: settings.SUPPORT_CONTACT,
}

COLOR_KEYS = {"primary_color", "gradient_from", "gradient_mid", "gradient_to", "ambient_color"}
BOOL_KEYS = {"gradient_enabled"}


async def load_appearance(db: AsyncSession) -> dict[str, object]:
    """Liest die Einstellungen: Datenbank schlaegt .env, .env schlaegt Vorgabe."""
    rows = await db.scalars(select(AppSetting))
    stored = {r.key: r.value for r in rows.all()}
    out: dict[str, object] = {}
    for key, default in DEFAULTS.items():
        value = stored.get(key)
        # Leerer String ist bei optionalen Feldern (gradient_mid, logo_url) ein
        # gueltiger Wert - deshalb "is not None" statt Truthiness.
        raw = value if value is not None else (default() or "")
        # In der Tabelle stehen nur Strings; Schalter wieder zu bool wandeln.
        out[key] = (raw == "1") if key in BOOL_KEYS else raw
    return out


@router.get("/appearance", response_model=PublicConfig)
async def get_appearance(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return PublicConfig(**await load_appearance(db))


@router.put("/appearance", response_model=PublicConfig, dependencies=[Depends(verify_csrf)])
async def update_appearance(payload: AppearanceUpdate, admin: User = Depends(require_admin),
                             db: AsyncSession = Depends(get_db)):
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        # Schalter kommen als bool herein, werden aber als "0"/"1" abgelegt.
        if key in BOOL_KEYS:
            value = "1" if value else "0"
        else:
            value = str(value).strip()
        # Farbwerte defensiv pruefen - der Wert landet spaeter als CSS-Variable
        # im Browser, ungueltige Eingaben wuerden dort still das Layout brechen.
        if key in COLOR_KEYS and value and not HEX.match(value):
            continue
        existing = await db.get(AppSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    await db.commit()
    return PublicConfig(**await load_appearance(db))


@router.post("/appearance/reset", response_model=PublicConfig, dependencies=[Depends(verify_csrf)])
async def reset_appearance(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Setzt auf die Werte aus der .env zurueck."""
    rows = await db.scalars(select(AppSetting))
    for row in rows.all():
        await db.delete(row)
    await db.commit()
    return PublicConfig(**await load_appearance(db))
