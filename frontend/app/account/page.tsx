"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError, User } from "@/lib/api";
import AppShell from "../components/AppShell";
import Button from "../components/ui/Button";
import Dialog from "../components/ui/Dialog";
import { Skeleton } from "../components/ui/Skeleton";

type Status = User & { is_active: boolean; totp_enabled: boolean };

export default function AccountPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Passwort aendern
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });

  // 2FA-Einrichtung
  const [setup, setSetup] = useState<{ provisioning_uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePw, setDisablePw] = useState("");

  async function reload() {
    setStatus(await api<Status>("/api/auth/status"));
  }

  useEffect(() => {
    reload().catch(() => router.replace("/login")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (loading) {
    return <AppShell user={null}><Skeleton className="h-64 w-full rounded-xl2" /></AppShell>;
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
            <Button className="mt-3" variant="danger" onClick={() => setDisableOpen(true)}>
              Zwei-Faktor deaktivieren
            </Button>
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
                    <code className="mt-1 block break-all rounded-md bg-raised px-2 py-1.5 font-mono text-xs">
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
                                   font-mono text-lg tracking-[0.3em] focus-ring"
                      />
                      <Button variant="primary" loading={busy} disabled={code.length !== 6}
                              onClick={() => act(async () => {
                                await api("/api/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
                                setSetup(null); setCode("");
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
      </div>

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
