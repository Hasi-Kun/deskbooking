export type ApiError = { status: number; message: string };

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

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
      message = body.detail || message;
    } catch {}
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
  ambient_color: string;
  logo_url: string;
  support_contact: string;
};

export type User = { id: string; email: string; full_name: string; role: string };

export type Floor = {
  id: string; name: string; width: number; height: number; sort_order: number;
};

export type Desk = {
  id: string; name: string; floor_id: string; zone: string;
  pos_x: number; pos_y: number; is_active: boolean;
  fixed_user_id: string | null; fixed_user_name: string | null;
};

export type Booking = {
  id: string; desk_id: string; desk_name: string; user_id: string; user_name: string;
  booking_date: string; status: string; comment: string; created_at: string;
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
  is_active: boolean; totp_enabled: boolean;
};
