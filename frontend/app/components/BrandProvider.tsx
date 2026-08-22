"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, PublicConfig } from "@/lib/api";

const defaultConfig: PublicConfig = {
  app_name: "Deskbooking",
  primary_color: "#A3E635",
  gradient_from: "#1E5799",
  gradient_mid: "#F300FF",
  gradient_to: "#E0FF00",
  ambient_color: "#34D399",
  logo_url: "",
  support_contact: "",
};

const BrandContext = createContext<PublicConfig>(defaultConfig);
export const useBrand = () => useContext(BrandContext);

/** Lädt die Darstellung neu - z. B. nach dem Speichern im Einstellungs-Menü. */
const RefreshContext = createContext<() => Promise<PublicConfig | null>>(async () => null);
export const useBrandRefresh = () => useContext(RefreshContext);

/** Wählt Schwarz oder Weiß als Schrift auf der Akzentfläche (WCAG-Näherung). */
function contrastInk(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#0a0a0a";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#0a0a0a" : "#ffffff";
}

/** Schreibt die Konfiguration in die CSS-Variablen des Dokuments. */
function applyToDocument(cfg: PublicConfig) {
  const root = document.documentElement;
  root.style.setProperty("--accent", cfg.primary_color);
  root.style.setProperty("--accent-ink", contrastInk(cfg.primary_color));
  // Verlauf und Hintergrundschein sind eigenständig und folgen der
  // Akzentfarbe bewusst NICHT.
  root.style.setProperty("--grad-from", cfg.gradient_from);
  root.style.setProperty("--grad-mid", cfg.gradient_mid);
  root.style.setProperty("--grad-to", cfg.gradient_to);
  root.style.setProperty("--ambient", cfg.ambient_color);
}

export default function BrandProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(defaultConfig);

  const refresh = useCallback(async () => {
    try {
      const cfg = await api<PublicConfig>("/api/config");
      setConfig(cfg);
      applyToDocument(cfg);
      document.title = cfg.app_name;
      return cfg;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <RefreshContext.Provider value={refresh}>
      <BrandContext.Provider value={config}>{children}</BrandContext.Provider>
    </RefreshContext.Provider>
  );
}
