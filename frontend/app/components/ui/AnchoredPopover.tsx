"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  /** Bezugsrechteck in Viewport-Koordinaten (z. B. von getBoundingClientRect). */
  anchor: DOMRect | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
};

const GAP = 10;
const MARGIN = 12;

/**
 * Blendet Inhalt direkt neben dem angeklickten Element ein - kein modales
 * Fenster, kein Abdunkeln der Seite. Die Position wird nach dem Rendern
 * gemessen und bei Bedarf gekippt (rechts -> links, unten -> oben), damit das
 * Panel nie aus dem sichtbaren Bereich läuft.
 */
export default function AnchoredPopover({ anchor, onClose, children, width = 288 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const el = ref.current;
    const h = el.offsetHeight;
    const w = el.offsetWidth || width;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Bevorzugt rechts daneben; kein Platz -> links; sonst mittig unter dem Element
    let left = anchor.right + GAP;
    let originX = "left";
    if (left + w > vw - MARGIN) {
      left = anchor.left - GAP - w;
      originX = "right";
      if (left < MARGIN) {
        left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - w / 2), vw - w - MARGIN);
        originX = "center";
      }
    }

    // Vertikal am Element ausrichten, aber im Viewport halten
    let top = anchor.top + anchor.height / 2 - h / 2;
    top = Math.min(Math.max(MARGIN, top), vh - h - MARGIN);
    const originY = anchor.top + anchor.height / 2 < top + h / 2 ? "top" : "center";

    setPos({ top, left, origin: `${originY} ${originX}` });
  }, [anchor, width, children]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    const onResize = () => onCloseRef.current();

    // WICHTIG: erst im nächsten Tick lauschen. Das Popover wird meist durch
    // pointerdown geöffnet - der zugehörige mousedown folgt unmittelbar danach
    // und würde es sofort wieder schließen. (Beim Ziehen fiel das nicht auf,
    // beim einfachen Klick auf eine Wand schon.)
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", onResize);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (!anchor) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      style={{
        position: "fixed",
        width,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        transformOrigin: pos?.origin,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 animate-scale-in"
    >
      {children}
    </div>
  );
}
