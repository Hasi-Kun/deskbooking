from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    # 6 Ziffern (Authenticator) ODER ein Einmal-Code im Format XXXX-XXXX.
    totp_code: str | None = Field(default=None, max_length=16)


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
    name_style: str = "plain"
    name_style_color: str = "#35E0C0"
    avatar_url: str | None = None


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
    fixed_user_style: str = "plain"
    fixed_user_style_color: str = "#35E0C0"
    capacity: int = 1
    # Wochentage (Montag=0...Sonntag=6), an denen die feste Zuweisung gilt.
    fixed_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class DeskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    floor_id: str
    zone: str = ""
    capacity: int = Field(default=1, ge=1, le=30)
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
    capacity: int | None = Field(default=None, ge=1, le=30)
    fixed_days: list[int] | None = None


# ---------- Booking ----------
class BookingCreate(BaseModel):
    desk_id: str
    booking_date: date
    slot: str = "full"          # full | morning | afternoon - ignoriert bei Konferenztischen
    # Nur fuer Konferenztische (Kapazitaet > 1) relevant: Uhrzeitfenster
    # statt Halbtags-Slot. Format "HH:MM".
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    comment: str = Field(default="", max_length=280)
    attendee_ids: list[str] = Field(default_factory=list, max_length=29)


class BookingRangeCreate(BaseModel):
    """Buchung ueber mehrere Tage in einem Rutsch (Wochen-/Monatsansicht)."""
    desk_id: str
    date_from: date
    date_to: date
    slot: str = "full"
    comment: str = Field(default="", max_length=280)
    attendee_ids: list[str] = Field(default_factory=list, max_length=29)
    skip_weekends: bool = True


class AttendeeOut(BaseModel):
    id: str
    full_name: str
    name_style: str = "plain"
    name_style_color: str = "#35E0C0"


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    desk_id: str
    desk_name: str
    user_id: str
    user_name: str
    user_name_style: str = "plain"
    user_name_style_color: str = "#35E0C0"
    booking_date: date
    status: str
    slot: str = "full"
    start_time: str | None = None
    end_time: str | None = None
    comment: str = ""
    attendees: list[AttendeeOut] = Field(default_factory=list)
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
    gradient_enabled: bool
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
    backup_codes_remaining: int = 0
    name_style: str = "plain"
    name_style_color: str = "#35E0C0"
    avatar_url: str | None = None


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
    gradient_enabled: bool | None = None
    ambient_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class BackupCodesResponse(BaseModel):
    """Codes im Klartext - werden genau einmal ausgeliefert."""
    codes: list[str]


class BackupCodeStatus(BaseModel):
    remaining: int
    total: int


class NameStyleUpdate(BaseModel):
    name_style: str = Field(pattern=r"^(plain|glitter|particles)$")
    name_style_color: str = Field(default="#35E0C0", pattern=r"^#[0-9a-fA-F]{6}$")


# ---------- Passkeys / WebAuthn ----------
class WebAuthnRegisterVerify(BaseModel):
    token: str
    credential: dict          # rohes JSON des Browsers (navigator.credentials.create())
    nickname: str = Field(default="", max_length=64)


class WebAuthnLoginOptionsRequest(BaseModel):
    email: EmailStr


class WebAuthnLoginVerify(BaseModel):
    token: str
    credential: dict          # rohes JSON des Browsers (navigator.credentials.get())


class PasskeyOut(BaseModel):
    id: str
    nickname: str
    device_type: str
    created_at: datetime
    last_used_at: datetime | None = None


# ---------- Chat ----------
class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    recipient_id: str | None = None   # None = globaler Kanal
    mentioned_user_ids: list[str] = Field(default_factory=list, max_length=50)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    channel: str
    sender_id: str
    sender_name: str
    sender_name_style: str = "plain"
    sender_name_style_color: str = "#35E0C0"
    sender_avatar_url: str | None = None
    sender_online: bool = False
    recipient_id: str | None = None
    body: str
    mentioned_user_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class ConversationOut(BaseModel):
    """Eine Zeile in der DM-Liste: mit wem, letzte Nachricht, ungelesen."""
    user_id: str
    user_name: str
    user_name_style: str = "plain"
    user_name_style_color: str = "#35E0C0"
    user_avatar_url: str | None = None
    user_online: bool = False
    last_message: str
    last_at: datetime
    unread: int


class DirectoryUser(BaseModel):
    """Sehr knappe Auskunft für die Personensuche im Chat - bewusst ohne
    E-Mail, Rolle oder 2FA-Status, das braucht dafür niemand zu sehen."""
    id: str
    full_name: str
    name_style: str = "plain"
    name_style_color: str = "#35E0C0"
    avatar_url: str | None = None
    online: bool = False


# ---------- Aktivitäten-Log (Admin) ----------
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    action: str
    entity: str = ""
    entity_id: str = ""
    ip_address: str = ""
    timestamp: datetime
    user_id: str | None = None
    user_name: str | None = None   # None, wenn das Konto seither gelöscht wurde


# ---------- Urlaub / Abwesenheit ----------
class AbsenceCreate(BaseModel):
    date_from: date
    date_to: date


class AbsenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    user_name: str
    date_from: date
    date_to: date
