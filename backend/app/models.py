import uuid
import enum
from datetime import datetime, date
from sqlalchemy import String, Boolean, ForeignKey, Date, DateTime, Enum, Integer, Float, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Role(str, enum.Enum):
    user = "user"
    admin = "admin"


class BookingStatus(str, enum.Enum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class ObjectKind(str, enum.Enum):
    """Nicht-buchbare Einrichtungselemente des Buero-Layouts."""
    wall = "wall"
    door = "door"
    window = "window"
    plant = "plant"
    cabinet = "cabinet"
    meeting_table = "meeting_table"
    label = "label"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.user, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # --- Zwei-Faktor-Authentifizierung (TOTP) ---
    # Das Secret wird erst beim Bestaetigen des ersten gueltigen Codes aktiviert,
    # damit sich niemand aussperrt, weil der Authenticator falsch eingerichtet war.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")


class Floor(Base):
    """Eine Ebene/ein Bereich des Buero-Layouts, z.B. '1. OG' oder 'Erdgeschoss'.
    width/height definieren die Groesse der Zeichenflaeche (in px) fuer den Layout-Builder."""
    __tablename__ = "floors"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=1000)
    height: Mapped[int] = mapped_column(Integer, default=600)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    desks: Mapped[list["Desk"]] = relationship(back_populates="floor", cascade="all, delete-orphan")
    scene_objects: Mapped[list["SceneObject"]] = relationship(
        back_populates="floor", cascade="all, delete-orphan"
    )


class Desk(Base):
    __tablename__ = "desks"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(64), nullable=False)          # z.B. "D-12"
    floor_id: Mapped[str] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"))
    zone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    pos_x: Mapped[float] = mapped_column(Float, default=0)                # freie Position auf der Zeichenflaeche (px)
    pos_y: Mapped[float] = mapped_column(Float, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)         # z.B. defekter Platz deaktivieren

    # Fest zugewiesener Platz (z.B. Teamleitung, Spezial-Hardware) - dauerhaft
    # belegt, taucht nicht im taeglichen Buchungspool auf und ist fuer andere nicht buchbar.
    fixed_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    floor: Mapped["Floor"] = relationship(back_populates="desks")
    fixed_user: Mapped["User | None"] = relationship(foreign_keys=[fixed_user_id])
    bookings: Mapped[list["Booking"]] = relationship(back_populates="desk", cascade="all, delete-orphan")


class SceneObject(Base):
    """Einrichtungselemente (Waende, Tueren, Pflanzen, ...). Nicht buchbar,
    dienen nur der Orientierung im Grundriss. Waende nutzen x2/y2 als Endpunkt,
    alle anderen Objekte width/height als Groesse."""
    __tablename__ = "scene_objects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    floor_id: Mapped[str] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"))
    kind: Mapped[ObjectKind] = mapped_column(Enum(ObjectKind), nullable=False)
    pos_x: Mapped[float] = mapped_column(Float, default=0)
    pos_y: Mapped[float] = mapped_column(Float, default=0)
    # Nur fuer Waende/Fenster: Endpunkt der Linie
    x2: Mapped[float | None] = mapped_column(Float, nullable=True)
    y2: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Nur fuer flaechige Objekte
    width: Mapped[float] = mapped_column(Float, default=40)
    height: Mapped[float] = mapped_column(Float, default=40)
    rotation: Mapped[float] = mapped_column(Float, default=0)
    label: Mapped[str] = mapped_column(String(64), default="")

    floor: Mapped["Floor"] = relationship(back_populates="scene_objects")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("desk_id", "booking_date", name="uq_desk_date_active"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    desk_id: Mapped[str] = mapped_column(ForeignKey("desks.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    booking_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.confirmed)
    comment: Mapped[str] = mapped_column(String(280), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    desk: Mapped["Desk"] = relationship(back_populates="bookings")
    user: Mapped["User"] = relationship(back_populates="bookings")


class RefreshToken(Base):
    """Ermoeglicht Widerruf einzelner Sessions (Logout / Sicherheitsvorfall)."""
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")


class AuditLog(Base):
    """Nachvollziehbares Audit-Log fuer Buchungsaenderungen (ISO 27001 Annex A.12.4)."""
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)   # login, login_failed, booking_create, ...
    entity: Mapped[str] = mapped_column(String(64), default="")
    entity_id: Mapped[str] = mapped_column(String(64), default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AppSetting(Base):
    """Zur Laufzeit aenderbare Einstellungen (Farben, Name, Logo).
    Werte hier ueberschreiben die Vorgaben aus der .env - so kann ein Admin
    das Erscheinungsbild anpassen, ohne den Container neu zu starten."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(512), default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
