"use client";
import { useState } from "react";

/**
 * Schlichtes Hover-Tooltip ohne fremde Abhängigkeiten - zeigt "label" über
 * dem umschlossenen Element. Für z.B. den exakten Zeitstempel hinter einer
 * "vor 5 Min."-Angabe.
 */
export default function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap
                     rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-lg animate-fade-in"
        >
          {label}
        </span>
      )}
    </span>
  );
}
