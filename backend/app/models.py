import uuid
import enum
from datetime import datetime, date, time, timedelta
from sqlalchemy import String, Boolean, ForeignKey, Date, DateTime, Time, Enum, Integer, Float, LargeBinary, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Role(str, enum.Enum):
    user = "user"
    admin = "admin"


class BookingSlot(str, enum.Enum):
    """Zeitfenster einer Buchung. "full" belegt den ganzen Tag und schliesst
    beide Halbtage aus; "morning"/"afternoon" koennen sich zwei Personen teilen."""
    full = "full"
    morning = "morning"
    afternoon = "afternoon"


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

    # --- Namens-Stil (rein kosmetisch, z.B. Glitzer-Effekt) ---
    name_style: Mapped[str] = mapped_column(String(20), default="plain")   # plain | glitter
    name_style_color: Mapped[str] = mapped_column(String(7), default="#35E0C0")
    # "Deine Buchung"-Markierung (Grundriss/Belegungsübersicht) folgt per
    # Default einer festen, neutralen Farbe statt der Marken-Akzentfarbe -
    # letztere kann sich unabhängig davon ändern (Branding-Einstellungen).
    mine_uses_accent: Mapped[bool] = mapped_column(Boolean, default=False)
    # Frei wählbare Farbe für "Deine Buchung", wenn sie NICHT an die
    # Akzentfarbe gebunden ist (siehe mine_uses_accent).
    mine_color: Mapped[str] = mapped_column(String(7), default="#3B82F6")

    # --- Profilbild ---
    # Bewusst als Bytes in der DB statt als Datei im Dateisystem: der
    # Frontend-Container ist zustandslos/austauschbar (kein eigenes Volume),
    # ein Bild im Dateisystem waere bei einem Neustart/Rebuild weg. Ueber die
    # DB ueberlebt es das wie jede andere Nutzer-Einstellung auch.
    avatar_mime: Mapped[str | None] = mapped_column(String(40), nullable=True)
    avatar_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def avatar_url(self) -> str | None:
        """Wird u.a. von UserOut/UserStatusOut ueber from_attributes gelesen -
        deshalb hier als Property statt als eigene Spalte."""
        if not self.avatar_data:
            return None
        ts = int(self.avatar_updated_at.timestamp()) if self.avatar_updated_at else 0
        return f"/api/users/{self.id}/avatar?v={ts}"

    # --- Erwähnungen im Chat (@Name) ---
    # Wann wurden zuletzt "meine" Erwähnungen gesehen? Bestimmt das
    # Benachrichtigungs-Badge - nur eigene Erwähnungen, nicht der ganze Kanal.
    last_mention_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- Online-Status (Chat) ---
    # Wird per Heartbeat (siehe /api/auth/heartbeat) alle ~25s aktualisiert,
    # solange der Tab offen/aktiv ist. "Online" ist rein zeitbasiert
    # abgeleitet (kein separater Socket/Presence-Server noetig).
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def online(self) -> bool:
        if not self.last_seen_at:
            return False
        ref = self.last_seen_at
        now = datetime.now(ref.tzinfo) if ref.tzinfo else datetime.utcnow()
        return (now - ref) < timedelta(seconds=90)

    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # passive_deletes=True: ohne das versucht SQLAlchemy beim Loeschen eines
    # Users, in bookings.user_id vorher NULL einzutragen (Standard-ORM-
    # Verhalten fuer eine unassoziierte Relationship) - das schlaegt fehl,
    # weil die Spalte NOT NULL ist. Mit passive_deletes ueberlaesst SQLAlchemy
    # das Aufraeumen komplett dem bereits vorhandenen ON DELETE CASCADE der DB.
    bookings: Mapped[list["Booking"]] = relationship(back_populates="user", passive_deletes=True)


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
    # An welchen Wochentagen die feste Zuweisung gilt (z.B. Buero Mo/Di/Do,
    # Homeoffice Mi/Fr) - an allen anderen Tagen ist der Platz frei buchbar.
    # Montag=0 ... Sonntag=6 (Python date.weekday()), als CSV gespeichert.
    # Default = alle Werktage, entspricht dem alten "immer fest"-Verhalten.
    fixed_days: Mapped[str] = mapped_column(String(20), default="0,1,2,3,4")

    floor: Mapped["Floor"] = relationship(back_populates="desks")
    fixed_user: Mapped["User | None"] = relationship(foreign_keys=[fixed_user_id])
    # 1 = normaler Einzelplatz. >1 = Konferenztisch/Gruppenraum - eine Person
    # bucht ihn und kann zusaetzliche Kolleg:innen als Teilnehmende angeben.
    capacity: Mapped[int] = mapped_column(Integer, default=1)
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
    # HINWEIS: Es gab hier frueher eine UniqueConstraint auf
    # (desk_id, booking_date, slot). Seit Konferenztische mit Uhrzeiten statt
    # Halbtags-Slots gebucht werden, koennen mehrere Buchungen denselben
    # Slot-Wert ("full", da bei Zeitbuchungen ungenutzt) teilen - die
    # Ueberschneidungspruefung passiert komplett im Router (Zeitueberlappung
    # bzw. Slot-Kollision), eine DB-Constraint kann das nicht mehr abbilden.

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    desk_id: Mapped[str] = mapped_column(ForeignKey("desks.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    booking_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.confirmed)
    slot: Mapped[BookingSlot] = mapped_column(Enum(BookingSlot), default=BookingSlot.full, nullable=False)
    # Nur bei Konferenztischen (Desk.capacity > 1) gesetzt: Uhrzeit-Fenster
    # statt ganztags/halbtags. Bei normalen Plaetzen bleiben beide NULL.
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    comment: Mapped[str] = mapped_column(String(280), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    desk: Mapped["Desk"] = relationship(back_populates="bookings")
    user: Mapped["User"] = relationship(back_populates="bookings")
    attendees: Mapped[list["BookingAttendee"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


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


class BookingAttendee(Base):
    """Zusaetzliche Teilnehmende einer Gruppenbuchung (Konferenztisch). Die
    buchende Person selbst steht bereits in Booking.user_id - hier stehen nur
    die WEITEREN Personen, die mit am Tisch sitzen."""
    __tablename__ = "booking_attendees"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # "selectin" statt dem Standard-Lazy-Loading: sonst funktioniert der
    # Zugriff auf a.user nur zufaellig dann, wenn der betreffende User schon
    # anderweitig in der Session-Identity-Map liegt (z.B. weil er kurz zuvor
    # beim Anlegen der Buchung geladen wurde) - bei einer frischen Abfrage
    # (z.B. GET /api/bookings) fehlt dieser Zufallstreffer und ein simpler
    # Lazy-Load in async Kontext bricht mit MissingGreenlet ab.
    user: Mapped["User"] = relationship(foreign_keys=[user_id], lazy="selectin")


class Message(Base):
    """Chat-Nachricht: entweder im globalen Kanal (channel="global",
    recipient_id=None) oder als Direktnachricht (channel="dm",
    recipient_id=<Empfaenger>). Ein Verlauf zwischen zwei Personen ergibt sich
    aus (sender_id, recipient_id) in beiden Richtungen - kein eigenes
    Konversations-Objekt noetig fuer diesen Umfang."""
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    channel: Mapped[str] = mapped_column(String(10), default="global", index=True)  # global | dm
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recipient_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    body: Mapped[str] = mapped_column(String(2000), nullable=False)
    # Erwähnte Nutzer-IDs, als ",id1,id2," gespeichert (führende/folgende
    # Kommas!) - so ist ein Substring-Check (",<id>," in mentions) sicher
    # gegen Teiltreffer zwischen UUIDs, ohne eine eigene Tabelle zu brauchen.
    mentions: Mapped[str] = mapped_column(String(2000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])
    recipient: Mapped["User | None"] = relationship(foreign_keys=[recipient_id])


class WebAuthnCredential(Base):
    """Ein registrierter Passkey/Sicherheitsschluessel (YubiKey, Touch ID,
    Windows Hello, ...). Der Public Key reicht zur Verifikation - private
    Schluessel verlassen das Geraet der Person nie."""
    __tablename__ = "webauthn_credentials"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Base64url-kodierte Credential-ID, wie sie der Browser/Authenticator liefert
    credential_id: Mapped[str] = mapped_column(String(512), unique=True, index=True)
    public_key: Mapped[str] = mapped_column(String(1024), nullable=False)   # Base64url (COSE-Key, DER)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    # Wie wurde registriert: "platform" (Touch ID/Windows Hello) oder "cross-platform" (YubiKey)
    device_type: Mapped[str] = mapped_column(String(20), default="cross-platform")
    backed_up: Mapped[bool] = mapped_column(Boolean, default=False)
    nickname: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WebAuthnChallenge(Base):
    """Kurzlebiger Zwischenspeicher fuer die WebAuthn-Challenge zwischen dem
    "options"- und dem "verify"-Aufruf. HTTP ist zustandslos, der Browser
    braucht die Challenge aber zwischen beiden Schritten unveraendert zurueck.
    "token" identifiziert den Vorgang beim Login, wo der Nutzer noch nicht
    angemeldet ist (daher user_id hier nullable)."""
    __tablename__ = "webauthn_challenges"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    challenge: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)   # registration | authentication
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BackupCode(Base):
    """Einmal-Codes als Ersatz fuer den Authenticator (verlorenes Telefon).
    Gespeichert wird nur der Hash - im Klartext sieht der Nutzer sie genau
    einmal bei der Erzeugung."""
    __tablename__ = "backup_codes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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

    # Nur lesend fuers Aktivitäten-Log gebraucht (kein back_populates auf
    # User noetig) - SET NULL beim Loeschen des Nutzers erhaelt den Eintrag.
    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])


class Absence(Base):
    """Urlaub/Abwesenheit einer Person. Wird bei festen Arbeitsplätzen
    berücksichtigt: ist der fest zugewiesene Nutzer an einem Tag abwesend,
    gilt der Platz für diesen Tag als frei buchbar statt blockiert."""
    __tablename__ = "absences"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


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
