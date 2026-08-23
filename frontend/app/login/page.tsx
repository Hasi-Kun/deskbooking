"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, markSessionActive } from "@/lib/api";
import { resetSessionExpired } from "@/lib/session-store";
import { isWebAuthnSupported, getPasskeyAssertion } from "@/lib/webauthn";
import { useBrand } from "../components/BrandProvider";
import Button from "../components/ui/Button";

type Step = "credentials" | "second-factor";
/** "checking": wird kurz angezeigt, während geprüft wird, ob ein Passkey
 *  hinterlegt ist. "passkey": Browser-Abfrage läuft/lief automatisch.
 *  "totp": Code-Eingabe (Standard, falls kein Passkey vorhanden ist, oder
 *  Ausweichoption, falls der Passkey gerade nicht greifbar ist). */
type SecondFactorMode = "checking" | "passkey" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const { support_contact } = useBrand();
  const [step, setStep] = useState<Step>("credentials");
  const [sfMode, setSfMode] = useState<SecondFactorMode>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const passkeySupported = isWebAuthnSupported();
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "credentials") passwordRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (sfMode === "totp") totpRef.current?.focus();
  }, [sfMode]);

  async function onCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Immer E-Mail UND Passwort gemeinsam - eine reine Passkey-Anmeldung
      // ohne Passwort gibt es bewusst nicht mehr: der Passkey-Status einer
      // Adresse wird dadurch erst NACH einer korrekten Passwortprüfung
      // abgefragt und verrät vorher nichts über die Existenz des Kontos.
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      markSessionActive();
      resetSessionExpired();
      router.replace("/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401 && apiErr.message?.includes("Authenticator")) {
        // Passwort war korrekt, zweiter Faktor fehlt noch.
        setStep("second-factor");
        setSfMode("checking");
        setError(null);
      } else {
        setError(apiErr.message || "Anmeldung fehlgeschlagen");
      }
    } finally {
      setLoading(false);
    }
  }

  // Sobald Schritt 2 erreicht ist: prüfen, ob ein Passkey hinterlegt ist,
  // und wenn ja sofort automatisch die Browser-Abfrage starten - ohne
  // weiteren Klick. Erst an dieser Stelle ist die Abfrage unbedenklich,
  // weil das Passwort schon bestätigt wurde.
  useEffect(() => {
    if (step !== "second-factor" || sfMode !== "checking") return;
    let cancelled = false;
    (async () => {
      let available = false;
      try {
        const { options } = await api<{ token: string; options: any }>(
          "/api/auth/webauthn/login/options", { method: "POST", body: JSON.stringify({ email }) }
        );
        available = passkeySupported && Array.isArray(options?.allowCredentials) && options.allowCredentials.length > 0;
      } catch {
        available = false;
      }
      if (cancelled) return;
      setHasPasskey(available);
      if (available) {
        setSfMode("passkey");
        void loginWithPasskey();
      } else {
        setSfMode("totp");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sfMode]);

  async function loginWithPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const { token, options } = await api<{ token: string; options: any }>(
        "/api/auth/webauthn/login/options", { method: "POST", body: JSON.stringify({ email }) }
      );
      const credential = await getPasskeyAssertion(options);
      await api("/api/auth/webauthn/login/verify", {
        method: "POST", body: JSON.stringify({ token, credential }),
      });
      markSessionActive();
      resetSessionExpired();
      router.replace("/dashboard");
    } catch (err: any) {
      // Abgebrochen/Timeout: kein Fehlertext, einfach zum erneuten Versuch
      // oder zur Code-Eingabe stehen lassen statt eine rote Meldung zu zeigen.
      if (err?.name !== "NotAllowedError") {
        setError(err?.message || "Passkey-Anmeldung fehlgeschlagen");
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST", body: JSON.stringify({ email, password, totp_code: totp }),
      });
      markSessionActive();
      resetSessionExpired();
      router.replace("/dashboard");
    } catch (err) {
      setError((err as ApiError).message || "Bestätigung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  function backToCredentials() {
    setStep("credentials");
    setSfMode("checking");
    setPassword("");
    setTotp("");
    setError(null);
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div aria-hidden="true"
           className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-[0.08]"
           style={{ background: "radial-gradient(55% 100% at 50% 0%, var(--ambient), transparent)" }} />

      <div className="relative w-full max-w-sm">
        <div className="relative space-y-4 rounded-2xl bg-surface p-6 shadow-2xl">
          <span aria-hidden="true"
                className="orb -top-20 left-1/2 h-44 w-44 -translate-x-1/2 opacity-[0.13]"
                style={{ background: "var(--ambient)" }} />

          {/* Schritt 1: E-Mail + Passwort zusammen */}
          {step === "credentials" && (
            <form onSubmit={onCredentialsSubmit} className="relative space-y-3.5 animate-fade-in">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
                  E-Mail-Adresse
                </label>
                <input id="email" type="email" required autoComplete="username" autoFocus value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       placeholder="vorname.nachname@firma.de"
                       className="w-full rounded-lg bg-raised px-3 py-2.5 text-sm
                                  transition-colors placeholder:text-muted/60 focus-ring" />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
                  Passwort
                </label>
                <input ref={passwordRef} id="password" type="password" required
                       autoComplete="current-password" value={password}
                       onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••"
                       className="w-full rounded-lg bg-raised px-3 py-2.5 text-sm
                                  transition-colors placeholder:text-muted/60 focus-ring" />
              </div>
              <Button type="submit" variant="primary" loading={loading} className="w-full">
                Anmelden
              </Button>
            </form>
          )}

          {/* Schritt 2: zweiter Faktor - Passkey (automatisch) oder TOTP */}
          {step === "second-factor" && (
            <div className="relative space-y-3.5 animate-fade-in">
              <EmailBadge email={email} onChange={backToCredentials} />

              {sfMode === "checking" && (
                <div className="flex items-center justify-center gap-2.5 py-6 text-sm text-muted">
                  <Spinner /> Wird geprüft…
                </div>
              )}

              {sfMode === "passkey" && (
                <div className="space-y-3.5">
                  <div className="flex flex-col items-center gap-2.5 rounded-lg bg-raised px-4 py-6 text-center">
                    <PasskeyIcon busy={passkeyBusy} />
                    <p className="text-sm text-ink">
                      {passkeyBusy ? "Bestätige im Browser-Fenster…" : "Passkey-Bestätigung"}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" loading={passkeyBusy}
                          onClick={loginWithPasskey} className="w-full">
                    Erneut versuchen
                  </Button>
                  <button type="button"
                          onClick={() => { setSfMode("totp"); setError(null); }}
                          className="mx-auto block text-xs text-muted underline focus-ring rounded">
                    Stattdessen Code eingeben
                  </button>
                </div>
              )}

              {sfMode === "totp" && (
                <form onSubmit={onTotpSubmit} className="space-y-3.5">
                  <div>
                    <label htmlFor="totp" className="mb-1.5 block text-xs font-medium text-muted">
                      6-stelliger Code aus deiner Authenticator-App
                    </label>
                    <input ref={totpRef} id="totp" inputMode="numeric" autoComplete="one-time-code" required
                           value={totp}
                           onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                           placeholder="123456"
                           className="w-full rounded-lg bg-raised px-3 py-2.5 text-center
                                      text-xl tracking-[0.35em] tabular-nums focus-ring" />
                    <p className="mt-1.5 text-[11px] text-muted">
                      Kein Zugriff aufs Gerät? Ein Einmal-Code (<span className="tracking-wide tabular-nums">XXXX-XXXX</span>) funktioniert ebenfalls.
                    </p>
                  </div>
                  <Button type="submit" variant="primary" loading={loading} className="w-full">
                    Bestätigen
                  </Button>
                  {hasPasskey && (
                    <button type="button"
                            onClick={() => { setSfMode("passkey"); setError(null); void loginWithPasskey(); }}
                            className="mx-auto block text-xs text-muted underline focus-ring rounded">
                      Stattdessen Passkey verwenden
                    </button>
                  )}
                </form>
              )}
            </div>
          )}

          {error && (
            <div role="alert"
                 className="relative rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">
              {error}
            </div>
          )}
        </div>

        {support_contact && (
          <p className="mt-4 text-center text-xs text-muted">
            Probleme bei der Anmeldung? {support_contact}
          </p>
        )}
      </div>
    </div>
  );
}

function EmailBadge({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-sm">
      <span className="truncate text-muted">{email}</span>
      <button type="button" onClick={onChange}
              className="shrink-0 text-xs text-muted underline focus-ring rounded">
        Ändern
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin text-muted" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function PasskeyIcon({ busy }: { busy?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className={busy ? "animate-pulse text-accent" : "text-muted"}>
      <circle cx="8.5" cy="9" r="4.5" />
      <path d="M13 9h8M17 9v4M20 9v4" />
      <path d="M4.5 16c0-1.5 2-2.5 4-2.5s4 1 4 2.5v2.5h-8z" />
    </svg>
  );
}
