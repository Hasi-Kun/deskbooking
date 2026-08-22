"use client";

export type ToggleOption<T extends string> = { value: T; label: string; title?: string };

/** Aneinanderliegende Schalter für exklusive Auswahl (z. B. Zeitraum-Filter). */
export default function ToggleGroup<T extends string>({
  options, value, onChange, ariaLabel, size = "sm",
}: {
  options: ToggleOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";

  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            title={opt.title}
            className={[
              "rounded-md font-medium transition-all duration-200",
              pad,
              active ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
