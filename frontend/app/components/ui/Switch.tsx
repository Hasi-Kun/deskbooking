"use client";

type Props = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
};

/**
 * Schalter mit Beschriftung rechts daneben. Der Knopf liegt INNERHALB der
 * Schiene: Breite 40, Knopf 16, Innenabstand 2 -> Weg von 2px bis 22px.
 */
export default function Switch({ id, checked, onChange, label, hint }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </label>

      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200 focus-ring",
          checked ? "border-transparent" : "border-line bg-raised",
        ].join(" ")}
        style={checked ? { background: "var(--accent)" } : undefined}
      >
        <span
          className="absolute top-1/2 block h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm
                     transition-[left] duration-200 ease-out"
          style={{ left: checked ? 20 : 3 }}
        />
      </button>
    </div>
  );
}
