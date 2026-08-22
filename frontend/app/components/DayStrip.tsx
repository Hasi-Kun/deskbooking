"use client";
import { fromISO } from "./ui/DatePicker";

export type DayLoad = { date: string; free: number; total: number; mine: boolean };

/** Ampel nach Anteil freier Plätze. Bewusst nur drei Stufen - man soll die
 *  Lage im Vorbeigehen erfassen, nicht Prozentwerte lesen. */
function tone(free: number, total: number) {
  if (total === 0) return { cls: "bg-occupied/40", label: "keine Plätze" };
  const pct = free / total;
  // Ampel bleibt bewusst grün/gelb/rot - unabhängig von der Akzentfarbe,
  // sonst ist die Aussage bei dunklem oder rotem Akzent nicht mehr lesbar.
  if (pct >= 0.5) return { cls: "bg-free", label: "viel frei" };
  if (pct >= 0.2) return { cls: "bg-amber-400", label: "wird eng" };
  if (pct > 0) return { cls: "bg-orange-500", label: "fast voll" };
  return { cls: "bg-red-500", label: "ausgebucht" };
}

export default function DayStrip({
  days, focus, onFocus,
}: { days: DayLoad[]; focus: string; onFocus: (iso: string) => void }) {
  if (days.length < 2) return null;

  return (
    <div className="flex gap-1 overflow-x-auto thin-scroll pb-1">
      {days.map((d) => {
        const dt = fromISO(d.date);
        const weekend = dt.getDay() === 0 || dt.getDay() === 6;
        const active = d.date === focus;
        const t = tone(d.free, d.total);
        const pct = d.total ? Math.round((d.free / d.total) * 100) : 0;

        return (
          <button
            key={d.date}
            onClick={() => onFocus(d.date)}
            aria-pressed={active}
            title={`${dt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} — ${d.free}/${d.total} frei (${t.label})`}
            className={[
              "group/day relative flex w-11 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5",
              "transition-all duration-200 focus-ring",
              active
                ? "border-accent/60 bg-raised"
                : "border-line hover:border-accent/30 hover:bg-raised",
              weekend && !active ? "opacity-45" : "",
            ].join(" ")}
          >
            <span className="text-[9px] uppercase leading-none tracking-wide text-muted">
              {dt.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}
            </span>
            <span className={[
              "mt-0.5 text-[13px] font-semibold leading-none tabular-nums",
              active ? "text-ink glow-text" : "text-ink",
            ].join(" ")}>
              {dt.getDate()}
            </span>

            {/* Auslastungsbalken statt Text - Höhe zeigt den freien Anteil */}
            <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
              <span
                className={`block h-full rounded-full transition-all duration-300 ${t.cls}`}
                style={{ width: `${Math.max(pct, d.total === 0 ? 0 : 6)}%` }}
              />
            </span>

            {d.mine && (
              <span className="absolute -top-0.5 right-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--accent-2)" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
