"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function formatLong(iso: string) {
  const d = fromISO(iso);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function daysBetween(a: string, b: string) {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000) + 1;
}

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  // Montag als erster Wochentag (JS liefert Sonntag=0)
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function MonthGrid({
  year, month, selected, rangeStart, rangeEnd, onPick,
}: {
  year: number; month: number;
  selected?: string; rangeStart?: string; rangeEnd?: string;
  onPick: (iso: string) => void;
}) {
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const todayISO = toISO(new Date());

  return (
    <div className="w-[248px]">
      <div className="text-xs font-semibold text-center mb-2">{MONTHS[month]} {year}</div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] text-muted text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const iso = toISO(date);
          const isSelected = iso === selected || iso === rangeStart || iso === rangeEnd;
          const inRange = !!(rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd);
          const isToday = iso === todayISO;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <button
              key={i}
              onClick={() => onPick(iso)}
              className={[
                "h-8 rounded-md text-xs transition-colors duration-150 focus-ring",
                isSelected ? "text-accent-ink font-semibold" : inRange ? "bg-accent/15" : "hover:bg-raised",
                !isSelected && isWeekend ? "text-muted" : "",
                isToday && !isSelected ? "ring-1 ring-accent/50" : "",
              ].join(" ")}
              style={isSelected ? { background: "var(--accent)" } : undefined}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      // pointer-events-auto: sonst schluckt ein umgebender Dialog die Klicks.
      className="absolute left-0 top-[calc(100%+6px)] z-40 pointer-events-auto rounded-xl2 border
                 border-line bg-surface p-3 shadow-xl animate-scale-in"
    >
      {children}
    </div>
  );
}

/** Einzelnes Datum. */
export function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const start = fromISO(value);
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2
                   text-sm hover:bg-raised transition-colors focus-ring"
      >
        <CalendarIcon />
        <span>{formatLong(value)}</span>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <NavHeader view={view} setView={setView} />
          <MonthGrid
            year={view.y} month={view.m} selected={value}
            onPick={(iso) => { onChange(iso); setOpen(false); }}
          />
        </Popover>
      )}
    </div>
  );
}

/** Zeitraum mit zwei Monaten nebeneinander. */
export function DateRangePicker({
  from, to, onChange,
}: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const s = fromISO(from);
  const [view, setView] = useState({ y: s.getFullYear(), m: s.getMonth() });

  function pick(iso: string) {
    if (!pending) {
      setPending(iso);
      return;
    }
    const [a, b] = pending <= iso ? [pending, iso] : [iso, pending];
    onChange(a, b);
    setPending(null);
    setOpen(false);
  }

  const next = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
  const count = daysBetween(from, to);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2
                   text-sm hover:bg-raised transition-colors focus-ring"
      >
        <CalendarIcon />
        <span>{formatLong(from)} – {formatLong(to)}</span>
        <span className="text-xs text-muted">({count} {count === 1 ? "Tag" : "Tage"})</span>
      </button>
      {open && (
        <Popover onClose={() => { setOpen(false); setPending(null); }}>
          <NavHeader view={view} setView={setView} />
          <div className="flex gap-4">
            <MonthGrid year={view.y} month={view.m} rangeStart={pending ?? from} rangeEnd={pending ? undefined : to} onPick={pick} />
            <MonthGrid year={next.y} month={next.m} rangeStart={pending ?? from} rangeEnd={pending ? undefined : to} onPick={pick} />
          </div>
          <p className="text-[11px] text-muted mt-2 text-center">
            {pending ? "Jetzt das Enddatum wählen" : "Startdatum wählen"}
          </p>
        </Popover>
      )}
    </div>
  );
}

function NavHeader({
  view, setView,
}: { view: { y: number; m: number }; setView: (v: { y: number; m: number }) => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <button
        onClick={() => setView(view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 })}
        className="h-7 w-7 rounded-md hover:bg-raised transition-colors focus-ring" aria-label="Vorheriger Monat"
      >←</button>
      <button
        onClick={() => setView(view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 })}
        className="h-7 w-7 rounded-md hover:bg-raised transition-colors focus-ring" aria-label="Nächster Monat"
      >→</button>
    </div>
  );
}
