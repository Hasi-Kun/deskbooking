from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    totp_code: str | None = Field(default=None, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)


# ---------- User ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    full_name: str
    role: str


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=10, max_length=256)


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=10, max_length=256)
    role: str = "user"   # "user" oder "admin"


# ---------- Floor ----------
class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    width: int
    height: int
    sort_order: int


class FloorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    width: int = Field(default=1000, ge=200, le=4000)
    height: int = Field(default=600, ge=200, le=4000)


class FloorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    width: int | None = Field(default=None, ge=200, le=4000)
    height: int | None = Field(default=None, ge=200, le=4000)
    sort_order: int | None = None


# ---------- Desk ----------
class DeskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    floor_id: str
    zone: str
    pos_x: float
    pos_y: float
    is_active: bool
    fixed_user_id: str | None = None
    fixed_user_name: str | None = None


class DeskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    floor_id: str
    zone: str = ""
    pos_x: float = 0
    pos_y: float = 0


class DeskUpdate(BaseModel):
    """Alle Felder optional - Admin kann Position, Name, Zone oder feste
    Zuweisung unabhaengig voneinander aendern (z.B. beim Ziehen im Builder)."""
    name: str | None = Field(default=None, min_length=1, max_length=64)
    zone: str | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    is_active: bool | None = None
    floor_id: str | None = None
    fixed_user_id: str | None = None            # "" oder null => Zuweisung entfernen
    clear_fixed_user: bool = False              # explizit setzen, um Zuweisung zu entfernen


# ---------- Booking ----------
class BookingCreate(BaseModel):
    desk_id: str
    booking_date: date
    comment: str = Field(default="", max_length=280)


class BookingRangeCreate(BaseModel):
    """Buchung ueber mehrere Tage in einem Rutsch (Wochen-/Monatsansicht)."""
    desk_id: str
    date_from: date
    date_to: date
    comment: str = Field(default="", max_length=280)
    skip_weekends: bool = True


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    desk_id: str
    desk_name: str
    user_id: str
    user_name: str
    booking_date: date
    status: str
    comment: str = ""
    created_at: datetime


class DeskAvailability(BaseModel):
    desk: DeskOut
    booking: BookingOut | None = None


# ---------- Public config ----------
class PublicConfig(BaseModel):
    app_name: str
    primary_color: str
    gradient_from: str
    gradient_mid: str
    gradient_to: str
    ambient_color: str
    logo_url: str
    support_contact: str


# ---------- Scene objects (Waende, Tueren, Pflanzen ...) ----------
class SceneObjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    floor_id: str
    kind: str
    pos_x: float
    pos_y: float
    x2: float | None = None
    y2: float | None = None
    width: float
    height: float
    rotation: float
    label: str


class SceneObjectCreate(BaseModel):
    floor_id: str
    kind: str
    pos_x: float = 0
    pos_y: float = 0
    x2: float | None = None
    y2: float | None = None
    width: float = 40
    height: float = 40
    rotation: float = 0
    label: str = Field(default="", max_length=64)


class SceneObjectUpdate(BaseModel):
    pos_x: float | None = None
    pos_y: float | None = None
    x2: float | None = None
    y2: float | None = None
    width: float | None = None
    height: float | None = None
    rotation: float | None = None
    label: str | None = Field(default=None, max_length=64)


# ---------- Zwei-Faktor-Authentifizierung ----------
class TotpSetupResponse(BaseModel):
    """otpauth-URI fuer den Authenticator. Das Secret wird erst nach
    erfolgreicher Code-Bestaetigung scharfgeschaltet."""
    provisioning_uri: str
    secret: str


class TotpVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TotpDisableRequest(BaseModel):
    password: str


class UserStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    totp_enabled: bool


class RoleUpdate(BaseModel):
    role: str  # "user" oder "admin"


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=10, max_length=256)


class AppearanceUpdate(BaseModel):
    """Vom Admin änderbares Erscheinungsbild. Leerer String = Wert aus .env
    wieder verwenden."""
    app_name: str | None = Field(default=None, max_length=64)
    primary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    gradient_from: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    gradient_mid: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    gradient_to: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ambient_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
