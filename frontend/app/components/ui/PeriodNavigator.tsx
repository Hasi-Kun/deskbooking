"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toISO, fromISO } from "./DatePicker";
import { CalendarCard, RangeCalendarCard, RangePreset } from "./Calendar";

export type RangeMode = "day" | "week" | "month" | "custom";

const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/** Wie in der Belegungsübersicht: einen Kalendertag weiterbewegen und dabei
 *  Wochenenden überspringen, statt auf ihnen zu landen. */
const stepWorkday = (iso: string, dir: 1 | -1) => {
  let cur = iso;
  do {
    cur = addDays(cur, dir);
  } while ([0, 6].includes(fromISO(cur).getDay()));
  return cur;
};
/** Fällt ein Datum auf ein Wochenende, auf den naechsten Werktag ziehen -
 *  fuer Direktauswahl im Kalender (Tagesmodus) und den "Heute"-Sprung. */
const toWorkday = (iso: string) => {
  const wd = fromISO(iso).getDay();
  return wd === 0 || wd === 6 ? stepWorkday(iso, 1) : iso;
};

/** Formatiert den Zeitraum so knapp wie möglich, ohne mehrdeutig zu werden:
 *  gleicher Monat -> "3.–9. März 2026", sonst "28. Feb – 6. März 2026". */
function formatPeriod(mode: RangeMode, from: string, to: string) {
  const a = fromISO(from);
  const b = fromISO(to);
  if (mode === "day") {
    return `${WEEKDAYS[(a.getDay() + 6) % 7]}, ${a.getDate()}. ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (mode === "month") return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameMonth) return `${a.getDate()}.–${b.getDate()}. ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (sameYear) {
    return `${a.getDate()}. ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()}. ${MONTHS[b.getMonth()].slice(0, 3)} ${a.getFullYear()}`;
  }
  return `${a.getDate()}.${a.getMonth() + 1}.${a.getFullYear()} – ${b.getDate()}.${b.getMonth() + 1}.${b.getFullYear()}`;
}

type Props = {
  mode: RangeMode;
  onModeChange: (m: RangeMode) => void;
  anchor: string;
  onAnchorChange: (iso: string) => void;
  custom: { from: string; to: string };
  onCustomChange: (from: string, to: string) => void;
  from: string;
  to: string;
};

export default function PeriodNavigator({
  mode, onModeChange, anchor, onAnchorChange, custom, onCustomChange, from, to,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function step(dir: 1 | -1) {
    if (mode === "day") return onAnchorChange(stepWorkday(anchor, dir));
    if (mode === "week") return onAnchorChange(addDays(anchor, 7 * dir));
    if (mode === "month") {
      const d = fromISO(anchor);
      return onAnchorChange(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
    // Freier Zeitraum: um die eigene Laenge weiterschieben
    const len = Math.round((fromISO(custom.to).getTime() - fromISO(custom.from).getTime()) / 86400000) + 1;
    onCustomChange(addDays(custom.from, len * dir), addDays(custom.to, len * dir));
  }

  const label = useMemo(() => formatPeriod(mode, from, to), [mode, from, to]);

  // Schnellauswahl für den freien Zeitraum
  const presets: RangePreset[] = useMemo(() => {
    const t = toISO(new Date());
    const d = fromISO(t);
    const monStart = addDays(t, -((d.getDay() + 6) % 7));
    const monthStart = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
    const monthEnd = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const lastMonthStart = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const lastMonthEnd = toISO(new Date(d.getFullYear(), d.getMonth(), 0));
    return [
      { label: "Heute", from: t, to: t },
      { label: "Diese Woche", from: monStart, to: addDays(monStart, 6) },
      { label: "Nächste Woche", from: addDays(monStart, 7), to: addDays(monStart, 13) },
      { label: "Nächste 14 Tage", from: t, to: addDays(t, 13) },
      { label: "Dieser Monat", from: monthStart, to: monthEnd },
      { label: "Letzter Monat", from: lastMonthStart, to: lastMonthEnd },
      { label: "Nächste 30 Tage", from: t, to: addDays(t, 29) },
    ];
  }, []);
  const todayISO = toISO(new Date());
  const isToday = mode === "day" ? anchor === todayISO : todayISO >= from && todayISO <= to;

  return (
    <div ref={wrapRef} className="relative inline-flex items-stretch rounded-lg border border-line bg-surface">
      <button
        onClick={() => step(-1)}
        aria-label="Zurück"
        className="grid w-8 place-items-center rounded-l-lg text-muted transition-colors
                   hover:bg-raised hover:text-ink focus-ring"
      >
        <Chevron dir="left" />
      </button>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-w-[190px] items-center justify-center gap-2 border-x border-line px-3 py-1.5
                   text-sm font-medium transition-colors hover:bg-raised focus-ring"
      >
        <span className="tabular-nums">{label}</span>
        <Chevron dir="down" className="text-muted" />
      </button>

      <button
        onClick={() => step(1)}
        aria-label="Weiter"
        className="grid w-8 place-items-center text-muted transition-colors
                   hover:bg-raised hover:text-ink focus-ring"
      >
        <Chevron dir="right" />
      </button>

      {/* Immer sichtbar (nicht mehr weg-animiert, sobald der Zeitraum "heute"
          entspricht) - so bleibt die Referenz zum aktuellen Tag jederzeit an
          derselben Stelle greifbar, statt bei jedem Rücksprung zu verschwinden.
          Nur der Klick selbst ist deaktiviert, wenn man schon auf "heute" steht. */}
      <button
        onClick={() => {
          onAnchorChange(toWorkday(todayISO));
          if (mode === "custom") onCustomChange(todayISO, addDays(todayISO, 6));
        }}
        disabled={isToday}
        className={[
          "border-l border-line px-2.5 text-xs transition-colors duration-200 rounded-r-lg",
          isToday ? "text-muted/40 cursor-default" : "text-muted hover:bg-raised hover:text-ink focus-ring",
        ].join(" ")}
      >
        Heute
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40">
          {mode === "custom" ? (
            <RangeCalendarCard
              from={custom.from}
              to={custom.to}
              presets={presets}
              onApply={(a, b) => { onCustomChange(a, b); setOpen(false); }}
              onCancel={() => setOpen(false)}
            />
          ) : (
            <div className="w-[302px]">
              <CalendarCard
                value={anchor}
                onApply={(iso) => { onAnchorChange(mode === "day" ? toWorkday(iso) : iso); setOpen(false); }}
                onCancel={() => setOpen(false)}
              />
            </div>
          )}
          {/* Ansichtswechsel unterhalb des Kalenders */}
          <div className="mt-2 flex gap-1 rounded-xl border border-line bg-surface p-1">
            {([
              ["day", "Tag"], ["week", "Woche"], ["month", "Monat"], ["custom", "Zeitraum"],
            ] as [RangeMode, string][]).map(([value, text]) => (
              <button
                key={value}
                onClick={() => onModeChange(value)}
                className={[
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors focus-ring",
                  mode === value ? "text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
                ].join(" ")}
                style={mode === value ? { background: "var(--accent)" } : undefined}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chevron({ dir, className = "" }: { dir: "left" | "right" | "down"; className?: string }) {
  const rotate = dir === "left" ? "rotate-90" : dir === "right" ? "-rotate-90" : "";
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className={`${rotate} ${className}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
