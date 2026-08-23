"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, markSessionActive } from "@/lib/api";
import { resetSessionExpired } from "@/lib/session-store";
import { isWebAuthnSupported, getPasskeyAssertion } from "@/lib/webauthn";
import { useBrand } from "../components/BrandProvider";
import Button from "../components/ui/Button";

type Step = "email" | "choose" | "password" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const { support_contact } = useBrand();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingPasskey, setCheckingPasskey] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const passkeySupported = isWebAuthnSupported();
  const passwordRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
    if (step === "totp") totpRef.current?.focus();
  }, [step]);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setCheckingPasskey(true);
    // Hinweis: Diese Abfrage verrät serverseitig zwangsläufig, ob zu dieser
    // E-Mail Passkeys hinterlegt sind (leere vs. nicht-leere allowCredentials-
    // Liste) - das war ursprünglich bewusst vermieden, um die Anmeldeseite
    // nicht zur Auskunftsquelle für Konto-/2FA-Status zu machen. Da die
    // Passkey-Option nun nur bei vorhandenem Schlüssel erscheinen soll, lässt
    // sich das nicht mehr vollständig vermeiden.
    let available = false;
    try {
      const { options } = await api<{ token: string; options: any }>(
        "/api/auth/webauthn/login/options", { method: "POST", body: JSON.stringify({ email }) }
      );
      available = passkeySupported && Array.isArray(options?.allowCredentials) && options.allowCredentials.length > 0;
    } catch {
      available = false;
    }
    setHasPasskey(available);
    setCheckingPasskey(false);
    // Kein Passkey hinterlegt (oder vom Browser nicht unterstützt): die
    // Auswahl-Zwischenseite hätte hier ohnehin nur einen einzigen Button -
    // direkt zur Passworteingabe springen.
    setStep(available ? "choose" : "password");
  }

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
      if (err?.name === "NotAllowedError") { setPasskeyBusy(false); return; }
      setError(err?.message || "Anmeldung mit Sicherheitsschlüssel fehlgeschlagen");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, totp_code: step === "totp" ? totp : undefined }),
      });
      markSessionActive();
      resetSessionExpired();
      router.replace("/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      if (step !== "totp" && apiErr.message?.includes("Authenticator")) {
        setStep("totp");
        setError(null);
      } else {
        setError(apiErr.message || "Anmeldung fehlgeschlagen");
      }
    } finally {
      setLoading(false);
    }
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

          {/* Schritt 1: nur die E-Mail-Adresse */}
          {step === "email" && (
            <form onSubmit={onEmailSubmit} className="relative space-y-3.5 animate-fade-in">
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
              <Button type="submit" variant="primary" loading={checkingPasskey} className="w-full">Weiter</Button>
            </form>
          )}

          {/* Schritt 2: Methode wählen - für jede E-Mail identisch dargestellt */}
          {step === "choose" && (
            <div className="relative space-y-3.5 animate-fade-in">
              <EmailBadge email={email} onChange={() => { setStep("email"); setError(null); }} />

              <Button
                type="button" variant="primary" loading={passkeyBusy}
                onClick={loginWithPasskey} className="w-full"
              >
                <PasskeyIcon /> Mit Passkey anmelden
              </Button>

              <div className="relative flex items-center gap-3 py-0.5">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] uppercase tracking-wide text-muted">oder</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <Button
                type="button" variant="secondary" className="w-full"
                onClick={() => { setStep("password"); setError(null); }}
              >
                Mit Passwort anmelden
              </Button>
            </div>
          )}

          {/* Schritt 3: Passwort */}
          {step === "password" && (
            <form onSubmit={onPasswordSubmit} className="relative space-y-3.5 animate-fade-in">
              <EmailBadge email={email} onChange={() => { setStep("email"); setError(null); }} />
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
              {hasPasskey && (
                <button type="button"
                        onClick={() => { setStep("choose"); setPassword(""); setError(null); }}
                        className="mx-auto block text-xs text-muted underline focus-ring rounded">
                  Andere Methode wählen
                </button>
              )}
            </form>
          )}

          {/* Schritt 4: TOTP (zweiter Faktor, nur falls das Konto es verlangt) */}
          {step === "totp" && (
            <form onSubmit={onPasswordSubmit} className="relative space-y-3.5 animate-fade-in">
              <EmailBadge email={email} onChange={() => { setStep("email"); setError(null); }} />
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
              <button type="button"
                      onClick={() => { setStep("password"); setTotp(""); setError(null); }}
                      className="mx-auto block text-xs text-muted underline focus-ring rounded">
                Zurück
              </button>
            </form>
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

function PasskeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8.5" cy="9" r="4.5" />
      <path d="M13 9h8M17 9v4M20 9v4" />
      <path d="M4.5 16c0-1.5 2-2.5 4-2.5s4 1 4 2.5v2.5h-8z" />
    </svg>
  );
}
