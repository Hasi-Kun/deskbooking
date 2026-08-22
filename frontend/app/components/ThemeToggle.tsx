"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});
export const useTheme = () => useContext(ThemeContext);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Uebergangsklasse nur waehrend des Wechsels, damit nicht jede spaetere
  // Hover-Farbaenderung mit 220ms nachzieht.
  root.classList.add("theme-transition");
  root.classList.toggle("dark", theme === "dark");
  window.setTimeout(() => root.classList.remove("theme-transition"), 250);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("deskbooking-theme") as Theme | null;
    const initial: Theme =
      stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem("deskbooking-theme", next);
      applyTheme(next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      title={isDark ? "Helles Design" : "Dunkles Design"}
      className="relative h-9 w-9 rounded-lg border border-line grid place-items-center
                 hover:bg-raised transition-colors focus-ring overflow-hidden"
    >
      <span
        className={[
          "absolute transition-all duration-300",
          isDark ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100",
        ].join(" ")}
      >
        <SunIcon />
      </span>
      <span
        className={[
          "absolute transition-all duration-300",
          isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50",
        ].join(" ")}
      >
        <MoonIcon />
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
