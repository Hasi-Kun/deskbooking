"""
Zentrale Konfiguration. Alles kommt aus Umgebungsvariablen (.env),
damit im Container niemals Secrets im Code stehen.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from urllib.parse import quote_plus


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Umgebung / Domain ---
    ENVIRONMENT: str = "production"          # "development" erlaubt lockerere Cookie-Regeln
    DOMAIN: str = "desks.example.com"        # ohne Protokoll, für CORS + Cookie-Domain
    PUBLIC_URL: str = "https://desks.example.com"

    # --- Datenbank ---
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "deskbooking"
    POSTGRES_USER: str = "deskbooking"
    POSTGRES_PASSWORD: str = "changeme"

    @property
    def database_url(self) -> str:
        """WICHTIG: Benutzername und Passwort MUESSEN URL-kodiert werden.
        Sonderzeichen wie @ : / ? # [ ] % haben in einer URL eine eigene
        Bedeutung. Ein Passwort wie "geheim@123#x" wuerde die URL sonst an der
        falschen Stelle zerlegen - der Parser haelt dann alles nach dem letzten
        '@' fuer den Hostnamen und versucht, etwas wie "123#x@db" aufzuloesen.
        Das aeussert sich als "socket.gaierror: Name or service not known" und
        sieht taeuschend nach einem DNS-/Netzwerkproblem aus, obwohl es ein
        reines String-Parsing-Problem ist."""
        user = quote_plus(self.POSTGRES_USER)
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # --- Auth / JWT ---
    JWT_SECRET_KEY: str = "CHANGE_ME_MIN_32_CHARS_RANDOM_VALUE"
    JWT_ALGORITHM: str = "HS256"
    # Zugriffs-Token laeuft nach Inaktivitaet ab. Das Frontend erneuert es
    # solange, wie jemand aktiv ist - nach einer Stunde ohne Aktivitaet ist
    # damit Schluss.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15

    # --- Erst-Admin (wird beim ersten Start angelegt, falls DB leer) ---
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "changeme-strong-password!"
    # Alternative zu ADMIN_PASSWORD: fertigen Argon2-Hash eintragen, dann steht
    # das Klartext-Passwort nirgends in der .env. Erzeugen mit:
    #   docker compose run --rm --no-deps backend python -c \
    #     "from argon2 import PasswordHasher; print(PasswordHasher().hash('DEIN-PASSWORT'))"
    # Ist dieser Wert gesetzt, wird ADMIN_PASSWORD ignoriert.
    ADMIN_PASSWORD_HASH: str = ""
    ADMIN_NAME: str = "Administrator"

    # --- Passkeys / WebAuthn (YubiKey, Touch ID, Windows Hello, ...) ---
    # Leer lassen, um sie aus DOMAIN/PUBLIC_URL abzuleiten (Normalfall).
    WEBAUTHN_RP_ID: str = ""
    WEBAUTHN_ORIGIN: str = ""

    @property
    def webauthn_rp_id(self) -> str:
        return self.WEBAUTHN_RP_ID or self.DOMAIN

    @property
    def webauthn_origin(self) -> str:
        return self.WEBAUTHN_ORIGIN or self.PUBLIC_URL

    # --- Branding / Customizing (kein festes Branding im Code, alles konfigurierbar) ---
    APP_NAME: str = "Deskbooking"
    # Akzentfarbe der Oberflaeche. Aenderbar in der .env ODER zur Laufzeit
    # ueber das Einstellungs-Menue (dann nur fuer den jeweiligen Browser).
    PRIMARY_COLOR: str = "#A3E635"
    # Verlauf: links -> Mitte -> rechts. UNABHAENGIG von PRIMARY_COLOR -
    # der Verlauf ist ein eigenstaendiges Gestaltungselement.
    GRADIENT_FROM: str = "#1E5799"
    GRADIENT_MID: str = "#F300FF"
    GRADIENT_TO: str = "#E0FF00"
    # Farbverlauf ueberhaupt anzeigen? Bei "false" wird stattdessen die
    # Akzentfarbe einfarbig verwendet (ruhigeres Erscheinungsbild).
    GRADIENT_ENABLED: bool = True
    # Farbe des dezenten Scheins im Seitenhintergrund - ebenfalls separat.
    AMBIENT_COLOR: str = "#34D399"
    LOGO_URL: str = ""                       # leer = Platzhalter-Icon im Frontend
    SUPPORT_CONTACT: str = ""

    @property
    def cors_origins(self) -> List[str]:
        return [self.PUBLIC_URL, f"https://{self.DOMAIN}"]

    @property
    def cookie_secure(self) -> bool:
        return self.ENVIRONMENT != "development"


settings = Settings()
