"use client";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Dialog({ open, onClose, title, description, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose wird vom Aufrufer meist als Inline-Arrow uebergeben und ist damit
  // bei JEDEM Render eine neue Funktion. Stuende sie in der Dependency-Liste
  // des Effekts, liefe dieser bei jedem Tastendruck erneut - und wuerde den
  // Fokus zurueck ins erste Feld setzen. Ueber die Ref bleibt der Effekt
  // stabil an "open" gebunden.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // Fokus im Dialog halten, solange er offen ist (einfacher Focus-Trap).
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    }, 30);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
    // Bewusst NUR "open" - siehe Kommentar zu onCloseRef oben.
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl2 border border-line bg-surface
                   shadow-2xl animate-scale-in"
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted mt-1">{description}</p>}
        </div>
        <div className="px-5 pb-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
