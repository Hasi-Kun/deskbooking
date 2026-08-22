"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useBrand } from "../components/BrandProvider";
import ThemeToggle from "../components/ThemeToggle";
import Button from "../components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const { support_contact } = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, totp_code: needsTotp ? totp : undefined }),
      });
      router.replace("/dashboard");
    } catch (err) {
      const apiErr = err as ApiError;
      // Backend meldet mit 401 + Hinweistext, dass der zweite Faktor fehlt.
      if (!needsTotp && apiErr.message?.includes("Authenticator")) {
        setNeedsTotp(true);
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
      <div className="absolute right-4 top-4"><ThemeToggle /></div>

      {/* Dezenter Schein im Hintergrund - eigene Farbe, unabhängig vom Akzent */}
      <div aria-hidden="true"
           className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-[0.08]"
           style={{ background: "radial-gradient(55% 100% at 50% 0%, var(--ambient), transparent)" }} />

      <div className="relative w-full max-w-sm">
        <form onSubmit={onSubmit} className="relative space-y-4 rounded-2xl bg-surface p-6 shadow-2xl">
          <span aria-hidden="true"
                className="orb -top-20 left-1/2 h-44 w-44 -translate-x-1/2 opacity-[0.13]"
                style={{ background: "var(--ambient)" }} />
          {!needsTotp ? (
            <div className="relative space-y-3.5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
                  E-Mail-Adresse
                </label>
                <input id="email" type="email" required autoComplete="username" value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       placeholder="vorname.nachname@firma.de"
                       className="relative w-full rounded-lg bg-raised px-3 py-2.5 text-sm
                                  transition-colors placeholder:text-muted/60 focus-ring" />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
                  Passwort
                </label>
                <input id="password" type="password" required autoComplete="current-password" value={password}
                       onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••"
                       className="relative w-full rounded-lg bg-raised px-3 py-2.5 text-sm
                                  transition-colors placeholder:text-muted/60 focus-ring" />
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <label htmlFor="totp" className="mb-1.5 block text-xs font-medium text-muted">
                6-stelliger Code aus deiner Authenticator-App
              </label>
              <input id="totp" inputMode="numeric" autoComplete="one-time-code" autoFocus required
                     value={totp}
                     onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                     placeholder="123456"
                     className="w-full rounded-lg bg-raised px-3 py-2.5 text-center
                                font-mono text-xl tracking-[0.35em] focus-ring" />
              <button type="button"
                      onClick={() => { setNeedsTotp(false); setTotp(""); setError(null); }}
                      className="mt-2 text-xs text-muted underline focus-ring rounded">
                Zurück zur Anmeldung
              </button>
            </div>
          )}

          {error && (
            <div role="alert"
                 className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" loading={loading} className="relative w-full">
            {needsTotp ? "Bestätigen" : "Anmelden"}
          </Button>
        </form>

        {support_contact && (
          <p className="mt-4 text-center text-xs text-muted">
            Probleme bei der Anmeldung? {support_contact}
          </p>
        )}
      </div>
    </div>
  );
}
