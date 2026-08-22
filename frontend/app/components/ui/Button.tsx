"use client";
import { useCallback, useRef, useState } from "react";

type Ripple = { id: number; x: number; y: number; size: number };
type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
};

const base =
  "relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg " +
  "font-medium select-none transition-all duration-200 focus-ring " +
  "disabled:opacity-55 disabled:pointer-events-none active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "text-accent-ink shadow-sm hover:shadow-md hover:brightness-110",
  secondary: "border border-line bg-surface hover:bg-raised hover:border-accent/40",
  ghost: "hover:bg-raised",
  danger: "border border-danger/30 text-danger hover:bg-danger/10",
};

const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3.5 py-2" };

export default function Button({
  variant = "secondary", size = "md", loading, className = "", children, onClick, ...rest
}: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Klickposition relativ zum Button -> Kreis waechst genau dort auf.
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const id = nextId.current++;
      setRipples((prev) => [
        ...prev,
        { id, size, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2 },
      ]);
      // Aufraeumen nach Ende der Animation - mehrere Ripples koennen parallel laufen.
      window.setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
      onClick?.(e);
    },
    [onClick]
  );

  return (
    <button
      {...rest}
      onClick={handleClick}
      disabled={rest.disabled || loading}
      style={variant === "primary" ? { background: "var(--accent)", ...rest.style } : rest.style}
      className={[base, variants[variant], sizes[size], className].join(" ")}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-white/45 animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
