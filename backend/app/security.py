import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from .config import settings

# Argon2id - aktuell empfohlener Passwort-Hash-Algorithmus (OWASP)
_ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload = {"sub": user_id, "role": role, "exp": expire, "type": "access"}
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expire_minutes * 60


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def generate_refresh_token() -> tuple[str, str]:
    """Gibt (raw_token, sha256_hash) zurueck. Nur der Hash landet in der DB."""
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------- TOTP / Zwei-Faktor ----------------
import pyotp


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str, issuer: str) -> str:
    """otpauth://-URI fuer QR-Code im Authenticator (Aegis, 1Password, ...)."""
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    """valid_window=1 erlaubt den vorherigen/naechsten 30s-Slot - faengt
    leichte Uhrzeit-Abweichungen zwischen Server und Telefon ab."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
