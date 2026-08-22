"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Sketch from "@uiw/react-color-sketch";

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
};

const DEFAULT_PRESETS = [
  "#A3E635", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA",
  "#F472B6", "#FB7185", "#FB923C", "#FACC15", "#E4E4E7",
];

const PANEL_W = 236;
const PANEL_H = 320;

/**
 * Farbfeld mit Auswahl-Popover (@uiw/react-color-sketch).
 *
 * Das Panel wird per Portal an <body> gehängt und fix positioniert. Ohne das
 * schneidet der umgebende Karten-Container (overflow-hidden für den Farbschein)
 * die Auswahl ab - sie war schlicht nicht sichtbar.
 */
export default function ColorPicker({ label, hint, value, onChange, presets = DEFAULT_PRESETS }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const margin = 10;
    // Bevorzugt links neben dem Feld (die Einstellungen sitzen rechts oben),
    // sonst rechts daneben; vertikal im sichtbaren Bereich halten.
    let left = r.left - PANEL_W - margin;
    if (left < margin) left = Math.min(r.right + margin, window.innerWidth - PANEL_W - margin);
    let top = r.top;
    if (top + PANEL_H > window.innerHeight - margin) top = window.innerHeight - PANEL_H - margin;
    setPos({ top: Math.max(margin, top), left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-ink">{label}</label>
        {hint && <span className="text-[10px] text-muted">{hint}</span>}
      </div>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-raised px-2.5 py-2
                   text-left transition-all duration-200 hover:border-muted/40 focus-ring"
      >
        <span
          className="h-6 w-6 shrink-0 rounded-md border border-black/25 transition-transform duration-200"
          style={{ background: value }}
        />
        <span className="text-xs uppercase tracking-wide text-muted tabular-nums">{value}</span>
      </button>

      {mounted && open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_W }}
          className="z-[100] animate-scale-in rounded-xl border border-line bg-surface p-2 shadow-2xl"
        >
          <Sketch
            color={value}
            disableAlpha
            presetColors={presets}
            onChange={(c) => onChange(c.hex.toUpperCase())}
            style={{ boxShadow: "none", background: "transparent", width: PANEL_W - 16 }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
