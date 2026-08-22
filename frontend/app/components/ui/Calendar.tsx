"use client";
import { useMemo, useState } from "react";
import { toISO, fromISO } from "./DatePicker";
import Button from "./Button";
import { GlowCard } from "./GlowCard";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function matrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Montag zuerst
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type GridProps = {
  year: number; month: number;
  selected?: string; start?: string; end?: string;
  onPick: (iso: string) => void;
  onHover?: (iso: string | null) => void;
  size?: "sm" | "lg";
};

function MonthGrid({ year, month, selected, start, end, onPick, onHover, size = "sm" }: GridProps) {
  const cells = useMemo(() => matrix(year, month), [year, month]);
  const todayISO = toISO(new Date());
  const cell = size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className={`grid place-items-center text-[10px] font-medium text-muted ${size === "lg" ? "h-8 w-10" : "h-6 w-8"}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <span key={i} className={cell} />;
          const iso = toISO(date);
          const isEdge = iso === selected || iso === start || iso === end;
          const inRange = !!(start && end && iso > start && iso < end);
          const isToday = iso === todayISO;
          const weekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <button
              key={i}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover?.(iso)}
              onMouseLeave={() => onHover?.(null)}
              className={[
                "grid place-items-center rounded-lg font-medium transition-all duration-150 focus-ring",
                cell,
                isEdge ? "text-accent-ink" : inRange ? "bg-accent/15 text-ink" : "hover:bg-raised",
                !isEdge && !inRange && weekend ? "text-muted" : "",
                isToday && !isEdge ? "ring-1 ring-accent/50" : "",
              ].join(" ")}
              style={isEdge ? { background: "var(--accent)" } : undefined}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Header({ view, setView, months = 1 }: {
  view: { y: number; m: number }; setView: (v: { y: number; m: number }) => void; months?: number;
}) {
  const next = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <button
        onClick={() => setView(view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 })}
        aria-label="Vorheriger Monat"
        className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink focus-ring"
      >‹</button>
      <div className="flex flex-1 justify-around text-sm font-semibold">
        <span>{MONTHS[view.m]} {view.y}</span>
        {months === 2 && <span>{MONTHS[next.m]} {next.y}</span>}
      </div>
      <button
        onClick={() => setView(view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 })}
        aria-label="Nächster Monat"
        className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink focus-ring"
      >›</button>
    </div>
  );
}

/* =============== Variante 1: große Karte mit Übernehmen =============== */

export function CalendarCard({
  value, onApply, onCancel,
}: { value: string; onApply: (iso: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const d = fromISO(value);
  const [view, setView] = useState({ y: d.getFullYear(), m: d.getMonth() });

  return (
    <GlowCard className="w-[302px]">
      <div className="px-6 py-5">
        <Header view={view} setView={setView} />
        <MonthGrid year={view.y} month={view.m} selected={draft} onPick={setDraft} size="lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-line p-4">
        <Button size="sm" onClick={onCancel}>Abbrechen</Button>
        <Button
          size="sm" onClick={() => onApply(draft)}
          className="border !border-accent/50 !bg-transparent font-medium text-accent
                     transition-colors duration-300 hover:!bg-accent hover:!text-accent-ink"
        >
          Übernehmen
        </Button>
      </div>
    </GlowCard>
  );
}

/* =============== Variante 2: Zeitraum mit Schnellauswahl =============== */

export type RangePreset = { label: string; from: string; to: string };

export function RangeCalendarCard({
  from, to, presets, onApply, onCancel,
}: {
  from: string; to: string; presets: RangePreset[];
  onApply: (from: string, to: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState({ from, to });
  const [pending, setPending] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const d = fromISO(from);
  const [view, setView] = useState({ y: d.getFullYear(), m: d.getMonth() });
  const next = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };

  function pick(iso: string) {
    if (!pending) { setPending(iso); return; }
    const [a, b] = pending <= iso ? [pending, iso] : [iso, pending];
    setDraft({ from: a, to: b });
    setPending(null);
  }

  // Während der Auswahl den Zeitraum unter dem Zeiger andeuten
  const shown = pending
    ? { start: pending <= (hover ?? pending) ? pending : hover!, end: pending <= (hover ?? pending) ? hover ?? pending : pending }
    : { start: draft.from, end: draft.to };

  return (
    <GlowCard className="w-[560px] max-w-[92vw]">
      <div className="flex">
        <div className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-line p-3 sm:flex">
          {presets.map((p) => {
            const active = draft.from === p.from && draft.to === p.to;
            return (
              <button
                key={p.label}
                onClick={() => { setDraft({ from: p.from, to: p.to }); setPending(null); setView({ y: fromISO(p.from).getFullYear(), m: fromISO(p.from).getMonth() }); }}
                className={[
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-ring",
                  active ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink",
                ].join(" ")}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 px-5 py-4">
          <Header view={view} setView={setView} months={2} />
          <div className="flex gap-5">
            <MonthGrid year={view.y} month={view.m} start={shown.start} end={shown.end}
                       onPick={pick} onHover={setHover} />
            <div className="hidden sm:block">
              <MonthGrid year={next.y} month={next.m} start={shown.start} end={shown.end}
                         onPick={pick} onHover={setHover} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={draft.from}
                 onChange={(e) => setDraft((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))}
                 className="rounded-md border border-line bg-raised px-2 py-1.5 focus-ring" />
          <span className="text-muted">–</span>
          <input type="date" value={draft.to} min={draft.from}
                 onChange={(e) => setDraft((r) => ({ ...r, to: e.target.value }))}
                 className="rounded-md border border-line bg-raised px-2 py-1.5 focus-ring" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onCancel}>Abbrechen</Button>
          <Button
            size="sm" onClick={() => onApply(draft.from, draft.to)}
            className="border !border-accent/50 !bg-transparent font-medium text-accent
                       transition-colors duration-300 hover:!bg-accent hover:!text-accent-ink"
          >
            Übernehmen
          </Button>
        </div>
      </div>
    </GlowCard>
  );
}
