"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Mausposition beim Rechtsklick (Viewport-Koordinaten). */
  at: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
};

const MARGIN = 10;

/**
 * Kontextmenü an der Mausposition. Klappt zum Rand hin um, damit es nie
 * abgeschnitten wird, und hängt per Portal an <body> - sonst würde der
 * überlaufende Editor-Container es beschneiden.
 */
export default function PointerPopover({ at, onClose, children, width = 268 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    // WICHTIG: "mounted" gehört in die Abhängigkeitsliste. Beim allerersten
    // Render ist mounted noch false, die Komponente gibt null zurück und der
    // Ref ist noch nicht gesetzt - der Effekt läuft trotzdem (Hooks laufen
    // unabhängig vom Rückgabewert), findet aber ref.current === null vor.
    // Ohne "mounted" in den Deps bleibt genau das der letzte Lauf: sobald
    // "mounted" auf true kippt und das Portal wirklich einhängt, ändert sich
    // an, [at, width, children] nichts, also feuert der Effekt kein zweites
    // Mal - die Position wird nie berechnet, das Menü bleibt bei (-9999,-9999)
    // und damit unsichtbar. Das war der Grund, warum das Kontextmenü im
    // DOM existierte, aber nie zu sehen war.
    if (!at || !ref.current) return;
    const h = ref.current.offsetHeight;
    const left = at.x + width + MARGIN > window.innerWidth ? at.x - width : at.x;
    const top = at.y + h + MARGIN > window.innerHeight ? Math.max(MARGIN, at.y - h) : at.y;
    setPos({ top, left: Math.max(MARGIN, left) });
  }, [at, width, children, mounted]);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [at]);

  if (!at || !mounted) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        width,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-[90] animate-scale-in"
    >
      {children}
    </div>,
    document.body
  );
}
