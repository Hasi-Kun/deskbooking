import { notifySessionExpired } from "./session-store";

export type ApiError = { status: number; message: string };

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

// Diese Endpunkte lösen bei 401 KEIN "Sitzung abgelaufen" aus - ein 401 dort
// ist ein normaler, erwarteter Teil des Anmeldevorgangs (falsches Passwort,
// fehlender Passkey, ...), keine abgelaufene Sitzung.
const AUTH_FLOW_PATHS = ["/api/auth/login", "/api/auth/webauthn/login"];

const SESSION_FLAG = "deskbooking-session-active";

/** Nach erfolgreichem Login aufrufen: merkt sich, dass es JEMALS eine echte
 *  Sitzung in diesem Browser gab. Nur dann bedeutet ein späterer 401
 *  tatsächlich "Sitzung abgelaufen" - ohne dieses Flag würde bereits der
 *  allererste, nie authentifizierte Seitenaufruf (der ganz normal mit 401
 *  auf /api/auth/me antwortet) fälschlich den Abgelaufen-Hinweis zeigen. */
export function markSessionActive() {
  if (typeof window !== "undefined") window.localStorage.setItem(SESSION_FLAG, "1");
}

/** Nach Logout oder nach dem Sitzung-abgelaufen-Hinweis aufrufen. */
export function clearSessionActive() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_FLAG);
}

function hadActiveSession(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(SESSION_FLAG) === "1";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  // FormData (z.B. Avatar-Upload) setzt den Content-Type samt Boundary
  // selbst - ein manuell gesetzter "application/json"-Header würde den
  // Request sonst kaputt machen (Backend kann die Teile nicht mehr trennen).
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData) headers.set("Content-Type", "application/json");

  // CSRF-Token (double-submit) fuer zustandsaendernde Requests mitsenden
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("csrf_token");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const res = await fetch(path, { ...options, headers, credentials: "include" });

  if (!res.ok) {
    let message = "Unbekannter Fehler";
    try {
      const body = await res.json();
      // FastAPI liefert bei 422 (Validierungsfehlern) KEINEN String in
      // "detail", sondern eine Liste von {type,loc,msg,input}-Objekten. Als
      // React-Kind gerendert crasht das mit "Objects are not valid as a
      // React child" (Error #31) - deshalb hier defensiv zu lesbarem Text
      // zusammenfassen, statt das Array/Objekt unverändert durchzureichen.
      if (Array.isArray(body?.detail)) {
        message = body.detail
          .map((d: any) => (typeof d === "string" ? d : d?.msg))
          .filter(Boolean)
          .join("; ") || message;
      } else if (typeof body?.detail === "string") {
        message = body.detail;
      } else if (body?.detail && typeof body.detail === "object") {
        message = body.detail.msg || message;
      }
    } catch {}

    if (res.status === 401 && !AUTH_FLOW_PATHS.some((p) => path.startsWith(p)) && hadActiveSession()) {
      // Nur melden, wenn dieser Browser zuvor WIRKLICH angemeldet war - sonst
      // wäre schon der erste, ganz normale "bin ich eingeloggt?"-Check eines
      // neuen Besuchers ein falscher "Sitzung abgelaufen"-Alarm.
      clearSessionActive();
      notifySessionExpired();
    }

    throw { status: res.status, message } as ApiError;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type PublicConfig = {
  app_name: string;
  primary_color: string;
  gradient_from: string;
  gradient_mid: string;
  gradient_to: string;
  gradient_enabled: boolean;
  ambient_color: string;
  logo_url: string;
  support_contact: string;
};

export type User = {
  id: string; email: string; full_name: string; role: string;
  name_style?: string; name_style_color?: string; avatar_url?: string | null;
};

export type Floor = {
  id: string; name: string; width: number; height: number; sort_order: number;
};

export type Desk = {
  id: string; name: string; floor_id: string; zone: string;
  pos_x: number; pos_y: number; is_active: boolean;
  fixed_user_id: string | null; fixed_user_name: string | null;
  fixed_user_style?: string; fixed_user_style_color?: string;
  /** 1 = normaler Einzelplatz. >1 = Konferenztisch mit Gruppenbuchung. */
  capacity: number;
  /** Wochentage (Montag=0...Sonntag=6), an denen "fixed_user_id" gilt - z.B.
   *  Büro Mo/Di/Do, Homeoffice Mi/Fr. An anderen Tagen ist der Platz frei. */
  fixed_days: number[];
};

export type BookingSlot = "full" | "morning" | "afternoon";

export type Attendee = {
  id: string; full_name: string; name_style?: string; name_style_color?: string;
};

export type Booking = {
  id: string; desk_id: string; desk_name: string; user_id: string; user_name: string;
  user_name_style?: string; user_name_style_color?: string;
  booking_date: string; status: string; slot: BookingSlot;
  start_time?: string | null; end_time?: string | null;
  comment: string;
  attendees: Attendee[]; created_at: string;
};

export type ObjectKind =
  | "wall" | "door" | "window" | "plant" | "cabinet" | "meeting_table" | "label";

export type SceneObject = {
  id: string; floor_id: string; kind: ObjectKind;
  pos_x: number; pos_y: number;
  x2: number | null; y2: number | null;
  width: number; height: number; rotation: number; label: string;
};

export type AdminUser = {
  id: string; email: string; full_name: string; role: string;
  is_active: boolean; totp_enabled: boolean; backup_codes_remaining?: number;
  avatar_url?: string | null;
};


export type Passkey = {
  id: string; nickname: string; device_type: string;
  created_at: string; last_used_at: string | null;
};


export type ChatMessage = {
  id: string; channel: "global" | "dm"; sender_id: string; sender_name: string;
  sender_name_style?: string; sender_name_style_color?: string; sender_avatar_url?: string | null;
  sender_online?: boolean;
  recipient_id: string | null; body: string; mentioned_user_ids?: string[]; created_at: string;
};

export type Conversation = {
  user_id: string; user_name: string;
  user_name_style?: string; user_name_style_color?: string; user_avatar_url?: string | null;
  user_online?: boolean;
  last_message: string; last_at: string; unread: number;
};

export type DirectoryUser = {
  id: string; full_name: string;
  name_style?: string; name_style_color?: string; avatar_url?: string | null; online?: boolean;
};

export type Absence = {
  id: string; user_id: string; user_name: string; date_from: string; date_to: string;
};

export type AuditLogEntry = {
  id: string; action: string; entity: string; entity_id: string; ip_address: string;
  timestamp: string; user_id: string | null; user_name: string | null;
};

/** Sortiert "D-2" vor "D-10" (nicht alphabetisch, wo "D-10" vor "D-2" käme).
 *  Zerlegt in Ziffern-/Nichtziffern-Blöcke und vergleicht Ziffernblöcke
 *  numerisch - so landen Tische/Konferenztische in der Reihenfolge ihrer
 *  laufenden Nummer statt in Textsortierung. */
export function naturalCompare(a: string, b: string): number {
  const pa = a.match(/(\d+)|(\D+)/g) ?? [];
  const pb = b.match(/(\d+)|(\D+)/g) ?? [];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") return nx - ny;
    return x < y ? -1 : 1;
  }
  return 0;
}
