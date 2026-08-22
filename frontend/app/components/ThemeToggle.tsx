"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  /** Wird nach dem Anmelden aufgerufen: lädt die Vorliebe dieses Kontos. */
  bindUser: (userId: string | null) => void;
}>({ theme: "dark", toggle: () => {}, bindUser: () => {} });

export const useTheme = () => useContext(ThemeContext);

/** Schlüssel pro Konto - sonst würde die Wahl einer Person für alle gelten,
 *  die denselben Browser benutzen (und auch schon vor der Anmeldung). */
const keyFor = (userId: string | null) =>
  userId ? `deskbooking-theme:${userId}` : null;

// Zusätzlich zum Konto-Schlüssel wird der zuletzt genutzte Wert unter DIESEM
// einfachen, globalen Schlüssel gespiegelt. Grund: das Vor-Paint-Skript in
// layout.tsx läuft, BEVOR React (und damit die Kontokennung) überhaupt
// existiert - es kann also nur einen einfachen, kontolosen Schlüssel lesen.
// Ohne diese Spiegelung rät das Skript rein nach Systemeinstellung, und
// sobald bindUser() Millisekunden später die echte, gespeicherte Präferenz
// des Kontos nachträgt, kippt das Theme sichtbar um - genau das gemeldete
// kurze Umschalten direkt nach dem Laden.
const GLOBAL_MIRROR_KEY = "deskbooking-theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme, animate = true) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [userId, setUserId] = useState<string | null>(null);

  // Erst den gespiegelten Wert prüfen (das, wonach schon das Vor-Paint-Skript
  // in layout.tsx entschieden hat) - sonst würde dieser Effekt die Wahl des
  // Skripts sofort nach dem ersten Bild wieder verwerfen und ausschließlich
  // nach Systemeinstellung entscheiden, was einen zweiten, unabhängigen
  // Flacker-Punkt erzeugt (unabhängig vom Konto-Flacker, den bindUser sonst
  // verursacht hätte). Ohne gespeicherten Wert (echter Erstbesuch) bleibt es
  // bei der Systemeinstellung.
  useEffect(() => {
    const stored = window.localStorage.getItem(GLOBAL_MIRROR_KEY) as Theme | null;
    const initial = stored ?? systemTheme();
    setTheme(initial);
    applyTheme(initial, false);
  }, []);

  const bindUser = useCallback((id: string | null) => {
    setUserId(id);
    const key = keyFor(id);
    const stored = key ? (window.localStorage.getItem(key) as Theme | null) : null;
    const next = stored ?? systemTheme();
    setTheme(next);
    applyTheme(next, false);
    // Spiegeln, damit der naechste Seitenaufruf (Vor-Paint-Skript) schon vor
    // der Anmeldung/Hydration die richtige Vermutung fuer DIESEN Browser hat.
    window.localStorage.setItem(GLOBAL_MIRROR_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      const key = keyFor(userId);
      // Nur für angemeldete Konten merken.
      if (key) window.localStorage.setItem(key, next);
      window.localStorage.setItem(GLOBAL_MIRROR_KEY, next);
      applyTheme(next);
      return next;
    });
  }, [userId]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, bindUser }}>
      {children}
    </ThemeContext.Provider>
  );
}
