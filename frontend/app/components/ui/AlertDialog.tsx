"use client";
import { useEffect, useRef } from "react";
import Button from "./Button";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  /** Beschriftung der Haupt-Aktion (rechts, hervorgehoben). */
  actionLabel: string;
  onAction: () => void;
  /** Ohne cancelLabel gibt es nur die eine Aktion - kein Wegklicken möglich.
   *  Für "Sitzung abgelaufen" ist das gewollt: es gibt nur "Neu anmelden". */
  cancelLabel?: string;
  onCancel?: () => void;
  actionBusy?: boolean;
  actionDisabled?: boolean;
  /** Zusätzlicher Inhalt zwischen Beschreibung und Aktionen, z.B. ein
   *  Eingabefeld (siehe Passkey-Namensvergabe). */
  children?: React.ReactNode;
};

/**
 * Bestätigungs-/Hinweisdialog nach dem AlertDialog-Muster: im Unterschied zum
 * normalen Dialog schließt er NICHT durch Klick daneben oder Escape - eine
 * bewusste Entscheidung ist hier Pflicht. Wird für die "Sitzung abgelaufen"-
 * Meldung und für Passkey-Bestätigungen verwendet.
 */
export default function AlertDialog({
  open, title, description, actionLabel, onAction, cancelLabel, onCancel, actionBusy, actionDisabled, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, textarea")?.focus() ?? actionRef.current?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      // Escape schließt NUR, wenn es einen expliziten Abbrechen-Weg gibt -
      // ein reiner Alert ohne Cancel (z.B. Sitzung abgelaufen) lässt sich
      // absichtlich nicht wegdrücken.
      if (e.key === "Escape" && onCancelRef.current) onCancelRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-xl2 border border-line bg-surface p-5 shadow-2xl animate-scale-in"
      >
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        {children && <div className="mt-3.5">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          {cancelLabel && (
            <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          )}
          <Button ref={actionRef} variant="primary" loading={actionBusy} disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
