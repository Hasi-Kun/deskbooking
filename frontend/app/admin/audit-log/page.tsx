"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AuditLogEntry, User } from "@/lib/api";
import AppShell from "../../components/AppShell";
import { useAppData } from "../../components/AppDataProvider";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Tooltip from "../../components/ui/Tooltip";
import { TimelineSkeleton } from "../../components/ui/Skeleton";

type Tone = "success" | "danger" | "info" | "neutral";

/** Bekannte action-Werte aus der audit_log-Tabelle in lesbaren deutschen
 *  Text übersetzt. Manche Actions tragen ein eingebettetes ":Ziel" (z.B.
 *  "user_deleted:Anna Admin") - wird beim Rendern abgetrennt und hier als
 *  target-Parameter gereicht, da die Tabelle selbst kein separates
 *  "betroffene Person"-Feld hat. Unbekannte/zukünftige Actions fallen auf
 *  den Rohwert zurück statt zu verschwinden (mit Tone "neutral" statt
 *  fälschlich "Erfolg" oder "Fehlgeschlagen" zu behaupten). */
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
  booking_create: { text: () => "hat einen Platz gebucht", tone: "info" },
  booking_cancel: { text: () => "hat eine Buchung storniert", tone: "neutral" },
  booking_create_range: { text: () => "hat mehrere Tage gebucht", tone: "info" },
  user_created: { text: () => "hat ein neues Konto angelegt", tone: "success" },
  user_deleted: { text: (t) => `hat das Konto „${t}“ endgültig gelöscht`, tone: "danger" },
  user_deactivated: { text: (t) => `hat das Konto „${t}“ deaktiviert`, tone: "neutral" },
  user_activated: { text: (t) => `hat das Konto „${t}“ reaktiviert`, tone: "success" },
  user_role_changed: { text: (t) => `hat die Rolle geändert${t ? `: ${t}` : ""}`, tone: "info" },
  user_password_reset: { text: (t) => `hat das Passwort von „${t}“ zurückgesetzt`, tone: "info" },
  user_2fa_disabled: { text: (t) => `hat 2FA von „${t}“ zurückgesetzt`, tone: "info" },
  floor_deleted: { text: (t) => `hat die Ebene „${t}“ gelöscht`, tone: "danger" },
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
  info: "text-accent bg-accent/10 border-accent/25",
  neutral: "text-muted bg-raised border-line",
};
const TONE_LABEL: Record<Tone, string> = {
  success: "Erfolg", danger: "Fehlgeschlagen", info: "Info", neutral: "Geändert",
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "success") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
    );
  }
  if (tone === "danger") {
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
  const [base, target] = e.action.split(":", 2);
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

export default function AuditLogPage() {
  const router = useRouter();
  const { data, ensure } = useAppData();
  const [user, setUser] = useState<User | null>(data.user);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

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

  if (loading) {
    return (
      <AppShell user={user}>
        <TimelineSkeleton rows={8} />
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Aktivität</h1>
        <p className="text-sm text-muted">
          Anmeldungen, fehlgeschlagene Anmeldeversuche, Buchungen und Änderungen in der Nutzerverwaltung.
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Noch keine Einträge.</p>
        ) : (
          <ol className="relative">
            {entries.map((e, i) => {
              const { text, tone } = describe(e);
              const isLast = i === entries.length - 1;
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
                      <Avatar name={e.user_name} size={32} />
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
