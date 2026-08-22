"use client";

type Props = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * Kästchen mit Beschriftung daneben (Field-Muster: Checkbox + Label
 * horizontal). Das native <input> bleibt erhalten und wird nur optisch
 * ersetzt - so funktionieren Tastatur, Formulare und Screenreader wie gewohnt.
 */
export default function Checkbox({ id, checked, onChange, label, hint, disabled }: Props) {
  return (
    <div className="flex w-auto items-start gap-2.5">
      <span className="relative mt-0.5 inline-flex h-4 w-4 shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none grid h-4 w-4 place-items-center rounded-[5px] border",
            "transition-all duration-200 ease-out",
            "peer-focus-visible:ring-1 peer-focus-visible:ring-muted/60",
            checked ? "border-transparent" : "border-line bg-raised peer-hover:border-muted/50",
            disabled ? "opacity-50" : "",
          ].join(" ")}
          style={checked ? { background: "var(--accent)" } : undefined}
        >
          <svg
            viewBox="0 0 12 12" fill="none"
            className={[
              "h-3 w-3 transition-all duration-200",
              checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
            ].join(" ")}
            style={{ color: "var(--accent-ink)" }}
          >
            <path d="M2.5 6.3 4.8 8.6 9.5 3.9" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>

      <label
        htmlFor={id}
        className={["cursor-pointer select-none leading-tight", disabled ? "opacity-50" : ""].join(" ")}
      >
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
      </label>
    </div>
  );
}
