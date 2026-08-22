"use client";
import { useEffect, useRef, useState } from "react";
import Sketch from "@uiw/react-color-sketch";

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  /** Kleine Vorschläge unter dem Feld. */
  presets?: string[];
};

const DEFAULT_PRESETS = [
  "#A3E635", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA",
  "#F472B6", "#FB7185", "#FB923C", "#FACC15", "#E4E4E7",
];

/**
 * Farbfeld mit Popover-Auswahl auf Basis von @uiw/react-color-sketch
 * (Sättigungsfläche, Farbton- und Alpha-Regler, Hex-Eingabe, Paletten).
 * Der Trigger zeigt die Farbe als Kachel mit Hex-Wert.
 */
export default function ColorPicker({ label, hint, value, onChange, presets = DEFAULT_PRESETS }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Erst im nächsten Tick lauschen, sonst schließt der öffnende Klick sofort wieder.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-ink">{label}</label>
        {hint && <span className="text-[10px] text-muted">{hint}</span>}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-raised px-2.5 py-2
                   text-left transition-colors hover:border-muted/40 focus-ring"
      >
        <span
          className="h-6 w-6 shrink-0 rounded-md border border-black/20"
          style={{ background: value }}
        />
        <span className="font-mono text-xs uppercase tracking-wide text-muted">{value}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 animate-scale-in rounded-xl border
                        border-line bg-surface p-2 shadow-2xl">
          <Sketch
            color={value}
            disableAlpha
            presetColors={presets}
            onChange={(c) => onChange(c.hex.toUpperCase())}
            style={{ boxShadow: "none", background: "transparent", width: 232 }}
          />
        </div>
      )}
    </div>
  );
}
