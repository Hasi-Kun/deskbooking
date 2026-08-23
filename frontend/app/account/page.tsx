"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError, Absence, Passkey, User } from "@/lib/api";
import AppShell from "../components/AppShell";
import { useAppData } from "../components/AppDataProvider";
import Button from "../components/ui/Button";
import Dialog from "../components/ui/Dialog";
import AlertDialog from "../components/ui/AlertDialog";
import ColorPicker from "../components/ui/ColorPicker";
import StyledName from "../components/StyledName";
import Avatar from "../components/ui/Avatar";
import { isWebAuthnSupported, createPasskey } from "@/lib/webauthn";
import { FormSkeleton } from "../components/ui/Skeleton";
import { DateRangePicker, formatLong, toISO, fromISO } from "../components/ui/DatePicker";

type Status = User & { is_active: boolean; totp_enabled: boolean; backup_codes_remaining?: number };

export default function AccountPage() {
  const router = useRouter();
  const { data } = useAppData();
  // Aus dem Cache vorbefüllen (nur für Name/Rolle, die AppShell fürs Menü
  // braucht) - die restlichen Felder (2FA-Status etc.) kommen gleich darauf
  // über den eigenen /api/auth/status-Aufruf und überschreiben diesen Platzhalter.
  const [status, setStatus] = useState<Status | null>(
    data.user ? { ...data.user, is_active: true, totp_enabled: false } : null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Passwort aendern
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });

  // 2FA-Einrichtung
  const [setup, setSetup] = useState<{ provisioning_uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Zwischenspeicher zwischen Browser-Bestaetigung und Namensvergabe:
  // token/credential kommen vom WebAuthn-Schritt, der Name wird erst danach
  // im Dialog erfragt (statt per window.prompt).
  const [pendingPasskey, setPendingPasskey] = useState<{ token: string; credential: any } | null>(null);
  const [passkeyNickname, setPasskeyNickname] = useState("");
  const [nameStyle, setNameStyle] = useState("plain");
  const [nameStyleColor, setNameStyleColor] = useState("#35E0C0");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [absenceRange, setAbsenceRange] = useState({ from: toISO(new Date()), to: toISO(new Date()) });
  const [absenceBusy, setAbsenceBusy] = useState(false);

  async function reload() {
    const s = await api<Status>("/api/auth/status");
    setStatus(s);
    setNameStyle(s.name_style || "plain");
    setNameStyleColor(s.name_style_color || "#35E0C0");
    return s;
  }

  async function reloadPasskeys() {
    setPasskeys(await api<Passkey[]>("/api/auth/webauthn"));
  }

  async function reloadAbsences() {
    setAbsences(await api<Absence[]>("/api/absences/mine"));
  }

  useEffect(() => {
    Promise.all([reload(), reloadPasskeys(), reloadAbsences()])
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addAbsence() {
    setAbsenceBusy(true); setError(null);
    try {
      await api("/api/absences", {
        method: "POST",
        body: JSON.stringify({ date_from: absenceRange.from, date_to: absenceRange.to }),
      });
      await reloadAbsences();
      setNotice("Urlaub eingetragen");
    } catch (e) {
      setError((e as ApiError)?.message || "Konnte nicht eingetragen werden");
    } finally {
      setAbsenceBusy(false);
    }
  }

  async function removeAbsence(id: string) {
    setAbsenceBusy(true); setError(null);
    try {
      await api(`/api/absences/${id}`, { method: "DELETE" });
      await reloadAbsences();
    } catch (e) {
      setError((e as ApiError)?.message || "Konnte nicht gelöscht werden");
    } finally {
      setAbsenceBusy(false);
    }
  }

  async function addPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const { token, options } = await api<{ token: string; options: any }>(
        "/api/auth/webauthn/register/options", { method: "POST" }
      );
      const credential = await createPasskey(options);
      // Browser-Bestätigung ist durch - jetzt den Namen erfragen (Dialog statt window.prompt)
      setPendingPasskey({ token, credential });
      setPasskeyNickname("");
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") setError(e?.message || "Passkey konnte nicht hinzugefügt werden");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function confirmPasskeyNickname() {
    if (!pendingPasskey) return;
    setPasskeyBusy(true);
    try {
      await api("/api/auth/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({
          token: pendingPasskey.token, credential: pendingPasskey.credential,
          nickname: passkeyNickname.trim() || "Passkey",
        }),
      });
      await reloadPasskeys();
      setNotice("Passkey hinzugefügt");
      setPendingPasskey(null);
    } catch (e: any) {
      setError(e?.message || "Passkey konnte nicht gespeichert werden");
      setPendingPasskey(null);
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (!confirm("Diesen Passkey entfernen?")) return;
    await api(`/api/auth/webauthn/${id}`, { method: "DELETE" });
    await reloadPasskeys();
  }

  async function saveNameStyle(style: string, color: string) {
    setNameStyle(style);
    setNameStyleColor(color);
    try {
      await api("/api/auth/name-style", {
        method: "PUT", body: JSON.stringify({ name_style: style, name_style_color: color }),
      });
    } catch (e) { /* stumm - rein kosmetisch, kein Blocker */ }
  }

  async function act(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await fn();
      await reload();
      if (ok) setNotice(ok);
    } catch (e) {
      setError((e as ApiError)?.message || "Aktion fehlgeschlagen");
    } finally { setBusy(false); }
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api("/api/account/avatar", { method: "POST", body: form });
      await reload();
    } catch (e) {
      setError((e as ApiError)?.message || "Bild konnte nicht hochgeladen werden");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true); setError(null);
    try {
      await api("/api/account/avatar", { method: "DELETE" });
      await reload();
    } catch (e) {
      setError((e as ApiError)?.message || "Bild konnte nicht entfernt werden");
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loading) {
    return <AppShell user={status}><FormSkeleton fields={4} /></AppShell>;
  }

  return (
    <AppShell user={status}>
      <div className="max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Konto</h1>
          <p className="mt-0.5 text-sm text-muted">{status?.email}</p>
        </div>

        {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
        {notice && <Banner tone="ok" onClose={() => setNotice(null)}>{notice}</Banner>}

        {/* Profilbild */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Profilbild</h2>
          <div className="mt-3 flex items-center gap-4">
            <Avatar name={status?.full_name || "?"} src={status?.avatar_url} size={64} />
            <div className="flex flex-wrap gap-2">
              <input
                ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadAvatar(file);
                }}
              />
              <Button size="sm" loading={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                Bild hochladen
              </Button>
              {status?.avatar_url && (
                <Button size="sm" variant="danger" loading={avatarBusy} onClick={removeAvatar}>
                  Entfernen
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">PNG, JPEG, WebP oder GIF, max. 2 MB.</p>
        </section>

        {/* Passwort */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Passwort ändern</h2>
          <div className="mt-3 space-y-3">
            <Input label="Aktuelles Passwort" type="password" value={pw.current}
                   onChange={(v) => setPw({ ...pw, current: v })} />
            <Input label="Neues Passwort (mind. 10 Zeichen)" type="password" value={pw.next}
                   onChange={(v) => setPw({ ...pw, next: v })} />
            <Input label="Neues Passwort wiederholen" type="password" value={pw.repeat}
                   onChange={(v) => setPw({ ...pw, repeat: v })} />
            <Button
              variant="primary" loading={busy}
              disabled={!pw.current || pw.next.length < 10 || pw.next !== pw.repeat}
              onClick={() => act(async () => {
                await api("/api/auth/change-password", {
                  method: "POST",
                  body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
                });
                setPw({ current: "", next: "", repeat: "" });
              }, "Passwort geändert")}
            >
              Passwort ändern
            </Button>
            {pw.next && pw.repeat && pw.next !== pw.repeat && (
              <p className="text-xs text-danger">Die Passwörter stimmen nicht überein.</p>
            )}
          </div>
        </section>

        {/* Zwei-Faktor */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Zwei-Faktor-Authentifizierung</h2>
              <p className="mt-1 text-sm text-muted">
                {status?.totp_enabled
                  ? "Aktiv. Bei jeder Anmeldung wird zusätzlich ein Code aus deiner Authenticator-App abgefragt."
                  : "Schützt dein Konto zusätzlich mit einem zeitbasierten Code (TOTP)."}
              </p>
            </div>
            <span className={[
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
              status?.totp_enabled ? "bg-free/15 text-free" : "bg-raised text-muted",
            ].join(" ")}>
              {status?.totp_enabled ? "Aktiv" : "Inaktiv"}
            </span>
          </div>

          {status?.totp_enabled ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted">
                Einmal-Codes übrig: <span className="text-ink tabular-nums">
                  {status.backup_codes_remaining ?? 0}
                </span>
                {(status.backup_codes_remaining ?? 0) <= 2 && (
                  <span className="ml-1 text-danger">– neue erzeugen empfohlen</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busy}
                        onClick={() => act(async () => {
                          const res = await api<{ codes: string[] }>("/api/auth/2fa/backup-codes",
                                                                     { method: "POST" });
                          setBackupCodes(res.codes);
                        }, "Neue Einmal-Codes erzeugt – alte sind ungültig")}>
                  Neue Einmal-Codes
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}>
                  Zwei-Faktor deaktivieren
                </Button>
              </div>
            </div>
          ) : setup ? (
            <div className="mt-4 space-y-4 animate-fade-in">
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2.5">
                  <Step n={1} />
                  <div>
                    <p>QR-Code mit deiner Authenticator-App scannen.</p>
                    <div className="mt-2 inline-block rounded-lg bg-white p-3">
                      <QRCodeSVG value={setup.provisioning_uri} size={148} />
                    </div>
                  </div>
                </li>
                <li className="flex gap-2.5">
                  <Step n={2} />
                  <div className="min-w-0">
                    <p>Falls Scannen nicht geht, Schlüssel manuell eintragen:</p>
                    <code className="mt-1 block break-all rounded-md bg-raised px-2 py-1.5 text-xs tabular-nums">
                      {setup.secret}
                    </code>
                  </div>
                </li>
                <li className="flex gap-2.5">
                  <Step n={3} />
                  <div className="w-full">
                    <p className="mb-2">Angezeigten 6-stelligen Code eingeben:</p>
                    <div className="flex gap-2">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric" placeholder="123456"
                        className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-center
                                   text-lg tracking-[0.3em] tabular-nums focus-ring"
                      />
                      <Button variant="primary" loading={busy} disabled={code.length !== 6}
                              onClick={() => act(async () => {
                                const res = await api<{ ok: boolean; backup_codes?: string[] }>(
                                  "/api/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
                                setSetup(null); setCode("");
                                if (res.backup_codes) setBackupCodes(res.backup_codes);
                              }, "Zwei-Faktor ist jetzt aktiv")}>
                        Bestätigen
                      </Button>
                    </div>
                  </div>
                </li>
              </ol>
              <Button variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>Abbrechen</Button>
            </div>
          ) : (
            <Button className="mt-3" variant="primary" loading={busy}
                    onClick={() => act(async () => {
                      const res = await api<{ provisioning_uri: string; secret: string }>(
                        "/api/auth/2fa/setup", { method: "POST" });
                      setSetup(res);
                    })}>
              Einrichtung starten
            </Button>
          )}
        </section>

        {/* Passkeys */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Passkeys</h2>
              <p className="mt-1 text-sm text-muted">
                Anmelden mit Touch ID, Windows Hello oder einem Sicherheitsschlüssel
                (z. B. YubiKey) — ohne Passwort, phishing-sicher.
              </p>
            </div>
          </div>

          {passkeys.length > 0 && (
            <ul className="mt-3 space-y-2">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pk.nickname}</p>
                    <p className="text-[11px] text-muted">
                      {pk.device_type === "platform" ? "Geräteintern" : "Sicherheitsschlüssel"}
                      {pk.last_used_at && ` · zuletzt genutzt ${new Date(pk.last_used_at).toLocaleDateString("de-DE")}`}
                    </p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => removePasskey(pk.id)}>Entfernen</Button>
                </li>
              ))}
            </ul>
          )}

          {isWebAuthnSupported() ? (
            <Button className="mt-3" variant="primary" loading={passkeyBusy} onClick={addPasskey}>
              Passkey hinzufügen
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted">Dieser Browser unterstützt keine Passkeys.</p>
          )}
        </section>

        {/* Urlaub / Abwesenheit */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Urlaub</h2>
          <p className="mt-1 text-sm text-muted">
            Für diesen Zeitraum gilt dein fester Arbeitsplatz (falls vorhanden) als frei buchbar.
          </p>

          {absences.length > 0 && (
            <ul className="mt-3 space-y-2">
              {absences.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2">
                  <span className="text-sm">{formatLong(a.date_from)} – {formatLong(a.date_to)}</span>
                  <Button size="sm" variant="danger" loading={absenceBusy} onClick={() => removeAbsence(a.id)}>
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DateRangePicker
              from={absenceRange.from} to={absenceRange.to}
              onChange={(from, to) => setAbsenceRange({ from, to })}
            />
            <Button variant="primary" loading={absenceBusy} onClick={addAbsence}>
              Eintragen
            </Button>
          </div>
        </section>

        {/* Namens-Stil */}
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Anzeige-Stil</h2>
          <p className="mt-1 text-sm text-muted">Wie dein Name für andere im Grundriss erscheint.</p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => saveNameStyle("plain", nameStyleColor)}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-ring",
                nameStyle === "plain" ? "border-accent/50 text-ink" : "border-line text-muted hover:bg-raised",
              ].join(" ")}
            >
              Normal
            </button>
            <button
              onClick={() => saveNameStyle("glitter", nameStyleColor)}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-ring",
                nameStyle === "glitter" ? "border-accent/50 text-ink" : "border-line text-muted hover:bg-raised",
              ].join(" ")}
            >
              Glitzer
            </button>
            <button
              onClick={() => saveNameStyle("particles", nameStyleColor)}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-ring",
                nameStyle === "particles" ? "border-accent/50 text-ink" : "border-line text-muted hover:bg-raised",
              ].join(" ")}
            >
              Glühen
            </button>
          </div>

          {(nameStyle === "glitter" || nameStyle === "particles") && (
            <div className="mt-3 max-w-[200px] animate-fade-in">
              <ColorPicker label="Farbe" value={nameStyleColor}
                           onChange={(c) => saveNameStyle(nameStyle, c)} />
            </div>
          )}

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-medium text-muted">Vorschau</p>
            <StyledName name={status?.full_name || "Name"} style={nameStyle} color={nameStyleColor} />
          </div>
        </section>
      </div>

      {/* Einmal-Codes: werden genau einmal im Klartext gezeigt */}
      {backupCodes && (
        <section className="rounded-xl2 border border-accent/40 bg-surface p-4 animate-fade-in">
          <h2 className="text-sm font-semibold">Deine Einmal-Codes</h2>
          <p className="mt-1 text-sm text-muted">
            Jetzt sichern – sie werden <strong>nur dieses eine Mal</strong> angezeigt. Jeder Code
            funktioniert einmal und ersetzt den Authenticator, falls du dein Telefon nicht hast.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-1.5">
            {backupCodes.map((c) => (
              <li key={c} className="rounded-md bg-raised px-2.5 py-1.5 text-center text-sm tracking-wider tabular-nums">
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(backupCodes.join("\n"))}>
              Kopieren
            </Button>
            <Button size="sm" variant="primary" onClick={() => setBackupCodes(null)}>
              Ich habe sie gesichert
            </Button>
          </div>
        </section>
      )}

      <Dialog
        open={disableOpen}
        onClose={() => { setDisableOpen(false); setDisablePw(""); }}
        title="Zwei-Faktor deaktivieren"
        description="Zur Sicherheit ist dafür dein Passwort erforderlich."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDisableOpen(false); setDisablePw(""); }}>Abbrechen</Button>
            <Button variant="danger" loading={busy}
                    onClick={() => act(async () => {
                      await api("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password: disablePw }) });
                      setDisableOpen(false); setDisablePw("");
                    }, "Zwei-Faktor deaktiviert")}>
              Deaktivieren
            </Button>
          </>
        }
      >
        <Input label="Passwort" type="password" value={disablePw} onChange={setDisablePw} />
      </Dialog>

      <AlertDialog
        open={!!pendingPasskey}
        title="Sicherheitsschlüssel benennen"
        description="Vergib einen Namen, damit du ihn später wiedererkennst – zum Beispiel „YubiKey Büro“ oder „Touch ID Laptop“."
        actionLabel="Speichern"
        actionBusy={passkeyBusy}
        actionDisabled={!passkeyNickname.trim()}
        onAction={confirmPasskeyNickname}
        cancelLabel="Verwerfen"
        onCancel={() => setPendingPasskey(null)}
      >
        <input
          autoFocus value={passkeyNickname}
          onChange={(e) => setPasskeyNickname(e.target.value.slice(0, 64))}
          onKeyDown={(e) => { if (e.key === "Enter" && passkeyNickname.trim()) confirmPasskeyNickname(); }}
          placeholder="z. B. YubiKey Büro"
          className="w-full rounded-lg bg-raised px-3 py-2 text-sm placeholder:text-muted/60 focus-ring"
        />
      </AlertDialog>
    </AppShell>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-accent-ink"
          style={{ background: "var(--accent)" }}>{n}</span>
  );
}

function Input({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus-ring" />
    </div>
  );
}

function Banner({ children, tone, onClose }: {
  children: React.ReactNode; tone: "danger" | "ok"; onClose: () => void;
}) {
  return (
    <div role="alert" className={[
      "flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm animate-fade-in",
      tone === "danger" ? "border-danger/30 bg-danger/10 text-danger" : "border-free/30 bg-free/10 text-free",
    ].join(" ")}>
      <span>{children}</span>
      <button onClick={onClose} aria-label="Schließen" className="focus-ring rounded">✕</button>
    </div>
  );
}
