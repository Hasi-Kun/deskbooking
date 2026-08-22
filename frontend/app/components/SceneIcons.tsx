"use client";
import { ObjectKind } from "@/lib/api";

/** Einheitliche, schlichte Piktogramme fuer die Einrichtungselemente.
 *  Bewusst als Linien-Icons (currentColor), damit sie im Dark Mode ohne
 *  eigene Varianten funktionieren. */
export function ObjectIcon({ kind, size = 20 }: { kind: ObjectKind; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "wall":
      return (<svg {...common}><path d="M3 7h18M3 12h18M3 17h18" /><path d="M8 7v5M16 12v5" /></svg>);
    case "door":
      return (<svg {...common}><path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" /><path d="M3 21h18" /><circle cx="13" cy="12" r="1" /></svg>);
    case "window":
      return (<svg {...common}><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M12 5v14M4 12h16" /></svg>);
    case "plant":
      return (<svg {...common}><path d="M12 20V11" /><path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5z" /><path d="M12 13c0-2.5-1.8-4.5-4.5-4.5 0 2.6 1.9 4.5 4.5 4.5z" /><path d="M8.5 20h7l-.7-3.5h-5.6z" /></svg>);
    case "cabinet":
      return (<svg {...common}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M12 3v18M9 8h.01M15 8h.01" /></svg>);
    case "meeting_table":
      return (<svg {...common}><ellipse cx="12" cy="12" rx="8" ry="5" /><circle cx="4" cy="12" r="1.4" /><circle cx="20" cy="12" r="1.4" /><circle cx="12" cy="6" r="1.4" /><circle cx="12" cy="18" r="1.4" /></svg>);
    case "label":
      return (<svg {...common}><path d="M4 7h16M4 12h10M4 17h7" /></svg>);
  }
}

export const OBJECT_LABELS: Record<ObjectKind, string> = {
  wall: "Wand",
  door: "Tür",
  window: "Fenster",
  plant: "Pflanze",
  cabinet: "Schrank",
  meeting_table: "Besprechungstisch",
  label: "Beschriftung",
};

/** Standardgroesse beim Ablegen aus der Palette (in px auf der Zeichenflaeche). */
export const OBJECT_DEFAULTS: Record<ObjectKind, { width: number; height: number }> = {
  wall: { width: 160, height: 8 },
  door: { width: 44, height: 44 },
  window: { width: 70, height: 14 },
  plant: { width: 38, height: 38 },
  cabinet: { width: 70, height: 34 },
  meeting_table: { width: 130, height: 80 },
  label: { width: 90, height: 24 },
};

export function DeskIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v6M19 12v6" />
      <rect x="9" y="3" width="6" height="5" rx="1" />
    </svg>
  );
}
