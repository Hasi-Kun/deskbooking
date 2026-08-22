"use client";

/**
 * Kartenrahmen nach dem Vorbild der „Monthly Balance"-Karte: sehr dunkle
 * Fläche, ein weich ausgeblendeter Farbschein oben, klare Trennlinien.
 * Wird für alle Popover (Buchung, Editor) verwendet, damit die Oberfläche
 * eine Handschrift hat.
 */
export function GlowCard({
  children, className = "", orb = true,
}: { children: React.ReactNode; className?: string; orb?: boolean }) {
  return (
    <div
      className={[
        "group relative overflow-hidden rounded-2xl border border-line bg-surface",
        "shadow-2xl glow-soft",
        className,
      ].join(" ")}
    >
      {orb && (
        <span
          aria-hidden="true"
          className="orb -top-24 left-1/2 h-48 w-48 -translate-x-1/2 opacity-[0.12]
                     transition-opacity duration-700 group-hover:opacity-[0.18]"
          style={{ background: "var(--accent)" }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardHeader({
  icon, title, subtitle, action,
}: { icon?: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-line px-5 py-4">{children}</div>;
}

/** Zwei Kennzahlen nebeneinander mit Trennlinie - wie im Vorbild. */
export function StatPair({
  left, right,
}: {
  left: { label: string; value: string; hint?: string; tone?: "accent" | "danger" | "muted" };
  right: { label: string; value: string; hint?: string; tone?: "accent" | "danger" | "muted" };
}) {
  const toneClass = (t?: string) =>
    t === "danger" ? "text-danger" : t === "muted" ? "text-muted" : "text-accent";
  return (
    <div className="flex divide-x divide-line">
      <div className="flex-1 pr-5">
        <p className="text-xs font-medium text-muted">{left.label}</p>
        <p className="text-xl font-semibold text-ink glow-text">{left.value}</p>
        {left.hint && <p className={`mt-1 text-xs font-medium ${toneClass(left.tone)}`}>{left.hint}</p>}
      </div>
      <div className="flex-1 pl-5">
        <p className="text-xs font-medium text-muted">{right.label}</p>
        <p className="text-xl font-semibold text-ink glow-text">{right.value}</p>
        {right.hint && <p className={`mt-1 text-xs font-medium ${toneClass(right.tone)}`}>{right.hint}</p>}
      </div>
    </div>
  );
}
