"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, PublicConfig } from "@/lib/api";
import { useBrand, useBrandRefresh } from "./BrandProvider";
import { useTheme } from "./ThemeToggle";
import ColorPicker from "./ui/ColorPicker";
import Switch from "./ui/Switch";
import Button from "./ui/Button";
import { GlowCard, CardHeader, CardBody, CardFooter } from "./ui/GlowCard";

/** Welche CSS-Variable zu welchem Feld gehört - für die Live-Vorschau. */
const CSS_VAR: Record<string, string> = {
  primary_color: "--accent",
  gradient_from: "--grad-from",
  gradient_mid: "--grad-mid",
  gradient_to: "--grad-to",
  ambient_color: "--ambient",
};

export default function SettingsMenu({ isAdmin }: { isAdmin: boolean }) {
  const brand = useBrand();
  const refreshBrand = useBrandRefresh();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PublicConfig>(brand);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(brand); }, [brand]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) discard();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && discard();
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand, draft]);

  function applyVars(cfg: PublicConfig) {
    const root = document.documentElement;
    Object.entries(CSS_VAR).forEach(([key, cssVar]) => {
      root.style.setProperty(cssVar, (cfg as any)[key]);
    });
    // Verlauf aus: alle Stufen auf den Akzent - alles wirkt einfarbig.
    if (!cfg.gradient_enabled) {
      ["--grad-from", "--grad-mid", "--grad-to"].forEach((v) =>
        root.style.setProperty(v, cfg.primary_color));
    }
  }

  function preview(patch: Partial<PublicConfig>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(false);
    applyVars(next);
  }

  function discard() {
    setOpen(false);
    applyVars(brand);      // Vorschau verwerfen
    setDraft(brand);
    setError(null);
    setSaved(false);
  }

  async function persist() {
    setBusy(true);
    setError(null);
    try {
      await api<PublicConfig>("/api/settings/appearance", {
        method: "PUT",
        body: JSON.stringify({
          app_name: draft.app_name,
          primary_color: draft.primary_color,
          gradient_from: draft.gradient_from,
          gradient_mid: draft.gradient_mid,
          gradient_to: draft.gradient_to,
          gradient_enabled: draft.gradient_enabled,
          ambient_color: draft.ambient_color,
          max_meeting_hours: draft.max_meeting_hours,
        }),
      });
      await refreshBrand();
      setSaved(true);
    } catch (e) {
      setError((e as ApiError)?.message || "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings/appearance/reset", { method: "POST" });
      const fresh = await refreshBrand();
      if (fresh) { setDraft(fresh); applyVars(fresh); }
      setSaved(true);
    } catch (e) {
      setError((e as ApiError)?.message || "Zurücksetzen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => (open ? discard() : setOpen(true))}
        aria-label="Einstellungen"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted
                   transition-colors hover:bg-raised hover:text-ink focus-ring"
      >
        <GearIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 animate-scale-in">
          <GlowCard>
            <CardHeader title="Einstellungen" subtitle="Darstellung anpassen" />

            <CardBody className="space-y-4">
              <Switch
                id="set-dark"
                checked={theme === "dark"}
                onChange={toggle}
                label="Dunkles Design"
              />

              {isAdmin ? (
                <>
                  <div className="space-y-1.5 border-t border-line pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Akzentfarbe</p>
                    <p className="text-[11px] leading-snug text-muted">
                      Buttons, Auswahl, freie Plätze. Unabhängig vom Verlauf.
                    </p>
                  </div>
                  <ColorPicker
                    label="Akzent"
                    value={draft.primary_color}
                    onChange={(hex) => preview({ primary_color: hex })}
                  />

                  <div className="space-y-1.5 border-t border-line pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Verlauf</p>
                    <div className="gradient-bar rounded-full" />
                  </div>
                  <Switch
                    id="set-gradient"
                    checked={draft.gradient_enabled}
                    onChange={(v) => preview({ gradient_enabled: v })}
                    label="Verlauf verwenden"
                    hint={draft.gradient_enabled ? "drei Stufen, links nach rechts" : "einfarbig in Akzentfarbe"}
                  />
                  <div className={[
                    "grid grid-cols-1 gap-3 transition-all duration-300",
                    draft.gradient_enabled ? "opacity-100" : "pointer-events-none max-h-0 overflow-hidden opacity-0",
                  ].join(" ")}>
                    <ColorPicker label="Links" hint="0 %" value={draft.gradient_from}
                                 onChange={(hex) => preview({ gradient_from: hex })} />
                    <ColorPicker label="Mitte" hint="50 %" value={draft.gradient_mid}
                                 onChange={(hex) => preview({ gradient_mid: hex })} />
                    <ColorPicker label="Rechts" hint="100 %" value={draft.gradient_to}
                                 onChange={(hex) => preview({ gradient_to: hex })} />
                  </div>

                  <div className="space-y-1.5 border-t border-line pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Hintergrund</p>
                  </div>
                  <ColorPicker
                    label="Schein"
                    hint="sehr dezent"
                    value={draft.ambient_color}
                    onChange={(hex) => preview({ ambient_color: hex })}
                  />

                  <div className="space-y-1.5 border-t border-line pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Buchungsregeln</p>
                  </div>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-ink">Max. Dauer je Konferenztisch-Buchung</span>
                    <span className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={24} value={draft.max_meeting_hours}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v)) preview({ max_meeting_hours: Math.max(0, Math.min(24, v)) });
                        }}
                        className="h-8 w-16 rounded-md border border-line bg-raised text-center text-sm tabular-nums focus-ring"
                      />
                      <span className="text-xs text-muted">Std.</span>
                    </span>
                  </label>
                  <p className="text-[11px] text-muted">0 = kein Limit.</p>

                  {error && (
                    <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                      {error}
                    </p>
                  )}
                  {saved && !error && (
                    <p className="text-xs text-accent">Gespeichert – gilt für alle Nutzer.</p>
                  )}
                </>
              ) : (
                <p className="border-t border-line pt-4 text-xs text-muted">
                  Farben können von Administratoren angepasst werden.
                </p>
              )}
            </CardBody>

            {isAdmin && (
              <CardFooter>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={resetAll} disabled={busy}>Zurücksetzen</Button>
                  <Button size="sm" variant="primary" loading={busy} onClick={persist}>Speichern</Button>
                </div>
              </CardFooter>
            )}
          </GlowCard>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
