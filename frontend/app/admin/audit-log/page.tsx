"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AuditLogEntry, User } from "@/lib/api";
import AppShell from "../../components/AppShell";
import { useAppData } from "../../components/AppDataProvider";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Tooltip from "../../components/ui/Tooltip";
import { TimelineSkeleton } from "../../components/ui/Skeleton";

type Tone = "success" | "danger" | "destructive" | "info" | "neutral";

/** Bekannte action-Werte aus der audit_log-Tabelle in lesbaren deutschen
 *  Text übersetzt. Manche Actions tragen ein eingebettetes ":Detail" (z.B.
 *  "user_deleted:Anna Admin" oder "booking_create:D-12 am 2026-09-15
 *  09:00–17:30 Uhr") - wird beim Rendern abgetrennt und hier als
 *  target-Parameter gereicht, da die Tabelle selbst kein separates
 *  "betroffene Person/Details"-Feld hat. Unbekannte/zukünftige Actions
 *  fallen auf den Rohwert zurück statt zu verschwinden (mit Tone "neutral"
 *  statt fälschlich "Erfolg" oder "Fehlgeschlagen" zu behaupten). */
const ACTION_META: Record<string, { text: (target?: string) => string; tone: Tone }> = {
  login_success: { text: () => "hat sich angemeldet", tone: "success" },
  login_success_passkey: { text: () => "hat sich per Passkey angemeldet", tone: "success" },
  login_failed: { text: () => "fehlgeschlagener Anmeldeversuch (falsches Passwort)", tone: "danger" },
  login_failed_passkey: { text: () => "fehlgeschlagener Passkey-Anmeldeversuch", tone: "danger" },
  login_failed_totp: { text: () => "fehlgeschlagener Anmeldeversuch (falscher 2FA-Code)", tone: "danger" },
  login_backup_code_used: { text: () => "hat sich mit einem Backup-Code angemeldet", tone: "info" },
  passkey_registered: { text: () => "hat einen neuen Passkey hinterlegt", tone: "success" },
  passkey_removed: { text: () => "hat einen Passkey entfernt", tone: "neutral" },
  password_changed: { text: () => "hat das eigene Passwort geändert", tone: "info" },
  "2fa_enabled": { text: () => "hat die Zwei-Faktor-Authentifizierung aktiviert", tone: "success" },
  "2fa_disabled": { text: () => "hat die Zwei-Faktor-Authentifizierung deaktiviert", tone: "neutral" },
  backup_codes_generated: { text: () => "hat neue Backup-Codes erzeugt", tone: "info" },
  booking_create: { text: (t) => `hat ${t ? `„${t}“` : "einen Platz"} gebucht`, tone: "success" },
  booking_cancel: { text: (t) => `hat ${t ? `„${t}“` : "eine Buchung"} storniert`, tone: "destructive" },
  booking_create_range: { text: (t) => `hat eine Serienbuchung angelegt${t ? `: „${t}“` : ""}`, tone: "success" },
  user_created: { text: () => "hat ein neues Konto angelegt", tone: "success" },
  user_deleted: { text: (t) => `hat das Konto „${t}“ endgültig gelöscht`, tone: "destructive" },
  user_deactivated: { text: (t) => `hat das Konto „${t}“ deaktiviert`, tone: "neutral" },
  user_activated: { text: (t) => `hat das Konto „${t}“ reaktiviert`, tone: "success" },
  user_role_changed: { text: (t) => `hat die Rolle geändert${t ? `: ${t}` : ""}`, tone: "info" },
  user_password_reset: { text: (t) => `hat das Passwort von „${t}“ zurückgesetzt`, tone: "info" },
  user_2fa_disabled: { text: (t) => `hat 2FA von „${t}“ zurückgesetzt`, tone: "info" },
  floor_created: { text: (t) => `hat die Ebene „${t}“ angelegt`, tone: "success" },
  floor_deleted: { text: (t) => `hat die Ebene „${t}“ gelöscht`, tone: "destructive" },
  desk_created: { text: (t) => `hat den Platz „${t}“ angelegt`, tone: "success" },
  desk_updated: { text: (t) => `hat einen Platz geändert${t ? `: ${t}` : ""}`, tone: "info" },
  desk_removed: { text: (t) => `hat den Platz „${t}“ entfernt`, tone: "destructive" },
  object_created: { text: (t) => `hat ein Element hinzugefügt${t ? `: ${t}` : ""}`, tone: "success" },
  object_removed: { text: (t) => `hat ein Element entfernt${t ? `: ${t}` : ""}`, tone: "destructive" },
};

// login_failed_unknown_email braucht die eingegebene Adresse (entity_id) im
// Text statt eines ":Ziel"-Suffix in der action selbst - deshalb separat.
function describeUnknownEmail(entityId: string): string {
  return entityId
    ? `Anmeldeversuch mit unbekannter E-Mail-Adresse: „${entityId}“`
    : "Anmeldeversuch mit unbekannter E-Mail-Adresse";
}

const TONE_BADGE: Record<Tone, string> = {
  success: "text-free bg-free/10 border-free/25",
  danger: "text-danger bg-danger/10 border-danger/25",
  destructive: "text-danger bg-danger/10 border-danger/25",
  info: "text-accent bg-accent/10 border-accent/25",
  neutral: "text-muted bg-raised border-line",
};
const TONE_LABEL: Record<Tone, string> = {
  success: "Erfolg", danger: "Fehlgeschlagen", destructive: "Entfernt", info: "Info", neutral: "Geändert",
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "success") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
    );
  }
  if (tone === "danger" || tone === "destructive") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />;
}

function describe(e: AuditLogEntry): { text: string; tone: Tone } {
  if (e.action === "login_failed_unknown_email") {
    return { text: describeUnknownEmail(e.entity_id), tone: "danger" };
  }
  // Nur am ERSTEN Doppelpunkt trennen - Details wie Uhrzeiten ("09:00–17:30")
  // enthalten selbst welche, ein simples split(":", 2) würde die abschneiden.
  const idx = e.action.indexOf(":");
  const base = idx === -1 ? e.action : e.action.slice(0, idx);
  const target = idx === -1 ? undefined : e.action.slice(idx + 1);
  const meta = ACTION_META[base];
  if (!meta) return { text: e.action, tone: "neutral" };
  return { text: meta.text(target), tone: meta.tone };
}

function timeAgo(iso: string) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffMin < 60 * 24) return `vor ${Math.round(diffMin / 60)} Std.`;
  if (diffMin < 60 * 24 * 7) return `vor ${Math.round(diffMin / (60 * 24))} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function exactTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// Grobe Kategorie je Aktions-Präfix - fürs Filtern in der Timeline.
const CATEGORY_OF: Record<string, string> = {
  login_success: "login", login_success_passkey: "login", login_failed: "login",
  login_failed_passkey: "login", login_failed_totp: "login", login_failed_unknown_email: "login",
  login_backup_code_used: "login", passkey_registered: "login", passkey_removed: "login",
  password_changed: "login", "2fa_enabled": "login", "2fa_disabled": "login", backup_codes_generated: "login",
  booking_create: "booking", booking_cancel: "booking", booking_create_range: "booking",
  user_created: "admin", user_deleted: "admin", user_deactivated: "admin", user_activated: "admin",
  user_role_changed: "admin", user_password_reset: "admin", user_2fa_disabled: "admin",
  floor_created: "layout", floor_deleted: "layout", desk_created: "layout", desk_updated: "layout",
  desk_removed: "layout", object_created: "layout", object_removed: "layout",
};
const CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "login", label: "Anmeldung" },
  { value: "booking", label: "Buchungen" },
  { value: "layout", label: "Layout" },
  { value: "admin", label: "Nutzerverwaltung" },
];

function categoryOf(action: string): string {
  const base = action.includes(":") ? action.slice(0, action.indexOf(":")) : action;
  return CATEGORY_OF[base] ?? "other";
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCsv(entries: AuditLogEntry[]) {
  const header = ["Zeitpunkt", "Person", "Aktion", "IP-Adresse"];
  const rows = entries.map((e) => {
    const { text } = describe(e);
    return [exactTime(e.timestamp), e.user_name ?? "Unbekannt/gelöscht", text, e.ip_address];
  });
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aktivitaetslog_${toDateStamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function toDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function AuditLogPage() {
  const router = useRouter();
  const { data, ensure } = useAppData();
  const [user, setUser] = useState<User | null>(data.user);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cache = await ensure({ user: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        if (cache.user.role !== "admin") { router.replace("/dashboard"); return; }
        setUser(cache.user);
        setEntries(await api<AuditLogEntry[]>("/api/admin/audit-log?limit=60"));
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (!entries.length) return;
    setLoadingMore(true);
    try {
      const before = entries[entries.length - 1].timestamp;
      const more = await api<AuditLogEntry[]>(
        `/api/admin/audit-log?limit=60&before=${encodeURIComponent(before)}`
      );
      if (more.length === 0) setExhausted(true);
      setEntries((prev) => [...prev, ...more]);
    } finally {
      setLoadingMore(false);
    }
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && categoryOf(e.action) !== category) return false;
      if (q && !(e.user_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, category, query]);

  async function handleExport() {
    setExporting(true);
    try {
      const all = await api<AuditLogEntry[]>("/api/admin/audit-log?limit=1000");
      const q = query.trim().toLowerCase();
      const toExport = all.filter((e) => {
        if (category !== "all" && categoryOf(e.action) !== category) return false;
        if (q && !(e.user_name ?? "").toLowerCase().includes(q)) return false;
        return true;
      });
      exportCsv(toExport);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <AppShell user={user}>
        <TimelineSkeleton rows={8} />
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Aktivität</h1>
          <p className="text-sm text-muted">
            Anmeldungen, fehlgeschlagene Anmeldeversuche, Buchungen und Änderungen in der Nutzerverwaltung.
          </p>
        </div>
        <Button size="sm" loading={exporting} onClick={handleExport}>Als CSV exportieren</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-line">
          {CATEGORIES.map((c, i) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={[
                "px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
                i === 0 ? "rounded-l-lg" : i === CATEGORIES.length - 1 ? "rounded-r-lg" : "border-x border-line",
                category === c.value ? "text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
              ].join(" ")}
              style={category === c.value ? { background: "var(--accent)" } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nach Person suchen…"
            className="w-52 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-xs
                       placeholder:text-muted/60 focus-ring"
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Noch keine Einträge.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Keine Einträge für diesen Filter.</p>
        ) : (
          <ol className="relative">
            {filtered.map((e, i) => {
              const { text, tone } = describe(e);
              const isLast = i === filtered.length - 1;
              return (
                <li
                  key={e.id}
                  className="group relative flex gap-3 rounded-xl px-2 py-2.5 -mx-2 transition-colors hover:bg-raised/60"
                >
                  {/* Verbindungslinie - endet am letzten Eintrag */}
                  {!isLast && (
                    <span className="absolute left-[23px] top-[42px] h-[calc(100%-6px)] w-px bg-line" aria-hidden="true" />
                  )}
                  <span className="relative z-10 shrink-0">
                    {e.user_name ? (
                      <Avatar name={e.user_name} src={e.user_avatar_url} size={32} />
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-raised text-muted ring-4 ring-surface">
                        <SystemIcon />
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-sm leading-snug">
                        <span className="font-medium text-ink">{e.user_name ?? "Unbekannt/gelöschtes Konto"}</span>{" "}
                        <span className="text-muted">{text}</span>
                      </span>
                      <span className={["inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium", TONE_BADGE[tone]].join(" ")}>
                        <ToneIcon tone={tone} />
                        {TONE_LABEL[tone]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                      <Tooltip label={exactTime(e.timestamp)}>
                        <span className="cursor-default underline decoration-dotted decoration-muted/40 underline-offset-2">
                          {timeAgo(e.timestamp)}
                        </span>
                      </Tooltip>
                      {e.ip_address && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{e.ip_address}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {entries.length > 0 && !exhausted && (
          <div className="mt-2 flex justify-center border-t border-line pt-4">
            <Button size="sm" loading={loadingMore} onClick={loadMore}>Weitere laden</Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01M15 9h.01M9 15c.7.7 1.9 1 3 1s2.3-.3 3-1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
