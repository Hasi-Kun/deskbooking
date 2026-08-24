"use client";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Wochentags-Auswahl (Montag=0...Sonntag=6) als Button-Reihe. Genutzt für
 *  "an welchen Tagen gilt die feste Zuweisung" (Layout-Editor) und für
 *  wiederkehrende Buchungen ("nur montags"). */
export default function WeekdayPicker({
  value, onChange, activeTitle = "Ausgewählt", inactiveTitle = "Nicht ausgewählt",
}: {
  value: number[];
  onChange: (days: number[]) => void;
  activeTitle?: string;
  inactiveTitle?: string;
}) {
  const toggle = (day: number) => {
    const set = new Set(value);
    if (set.has(day)) set.delete(day); else set.add(day);
    onChange(Array.from(set).sort());
  };
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            aria-pressed={active}
            title={active ? activeTitle : inactiveTitle}
            className={[
              "rounded-md py-1.5 text-[11px] font-medium transition-colors focus-ring",
              active ? "text-accent-ink" : "bg-raised text-muted hover:text-ink",
            ].join(" ")}
            style={active ? { background: "var(--accent)" } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
