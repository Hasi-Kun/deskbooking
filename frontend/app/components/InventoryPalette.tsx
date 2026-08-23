"use client";
import { ObjectKind } from "@/lib/api";
import { ObjectIcon, OBJECT_LABELS, DeskIcon } from "./SceneIcons";

/** "desk" mit variant "meeting" legt denselben buchbaren Platz an, nur mit
 *  Standard-Kapazität >1 und größerer Kachel - ein echter, buchbarer
 *  Konferenztisch statt der reinen Deko-Einrichtung weiter unten. */
export type PaletteItem =
  | { kind: "desk"; variant?: "single" | "meeting" }
  | { kind: "object"; objectKind: ObjectKind };

const OBJECT_ORDER: ObjectKind[] = [
  "wall", "door", "window", "plant", "cabinet", "meeting_table", "label",
];

type Props = {
  wallMode: boolean;
  onToggleWallMode: () => void;
};

/** Werkzeugleiste des Layout-Builders. Elemente werden per HTML5-Drag&Drop
 *  auf die Zeichenflaeche gezogen; Waende entstehen stattdessen durch Ziehen
 *  einer Linie direkt auf der Flaeche (eigener Modus). */
export default function InventoryPalette({ wallMode, onToggleWallMode }: Props) {
  function startDrag(e: React.DragEvent, item: PaletteItem) {
    e.dataTransfer.setData("application/x-deskbooking-item", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <aside className="rounded-xl2 border border-line bg-surface p-3 space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Arbeitsplatz</p>
        <div className="space-y-1.5">
          <div
            draggable
            onDragStart={(e) => startDrag(e, { kind: "desk", variant: "single" })}
            className="group/item flex items-center gap-2.5 rounded-lg border border-line p-2.5
                       cursor-grab active:cursor-grabbing hover:border-accent/50 hover:bg-raised
                       transition-all duration-200"
          >
            <span className="text-accent transition-transform duration-200 group-hover/item:scale-110">
              <DeskIcon />
            </span>
            <span className="text-sm">Tisch</span>
          </div>
          <div
            draggable
            onDragStart={(e) => startDrag(e, { kind: "desk", variant: "meeting" })}
            title="Buchbarer Tisch mit mehreren Plätzen (Gruppenbuchung)"
            className="group/item flex items-center gap-2.5 rounded-lg border border-line p-2.5
                       cursor-grab active:cursor-grabbing hover:border-accent/50 hover:bg-raised
                       transition-all duration-200"
          >
            <span className="text-accent transition-transform duration-200 group-hover/item:scale-110">
              <ObjectIcon kind="meeting_table" />
            </span>
            <span className="text-sm">Konferenztisch</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Einrichtung</p>
        <div className="grid grid-cols-2 gap-1.5">
          {OBJECT_ORDER.filter((k) => k !== "wall").map((kind) => (
            <div
              key={kind}
              draggable
              onDragStart={(e) => startDrag(e, { kind: "object", objectKind: kind })}
              title={OBJECT_LABELS[kind]}
              className="group/item flex flex-col items-center gap-1 rounded-lg border border-line p-2
                         cursor-grab active:cursor-grabbing hover:border-accent/50 hover:bg-raised
                         transition-all duration-200"
            >
              <span className="text-muted transition-all duration-200
                               group-hover/item:text-accent group-hover/item:scale-110">
                <ObjectIcon kind={kind} />
              </span>
              <span className="text-[10px] text-center leading-tight">{OBJECT_LABELS[kind]}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Wände</p>
        <button
          onClick={onToggleWallMode}
          aria-pressed={wallMode}
          className={[
            "w-full flex items-center gap-2.5 rounded-lg border p-2.5 text-sm transition-all duration-200 focus-ring",
            wallMode
              ? "border-transparent text-accent-ink shadow-sm"
              : "border-line hover:border-accent/50 hover:bg-raised",
          ].join(" ")}
          style={wallMode ? { background: "var(--accent)" } : undefined}
        >
          <ObjectIcon kind="wall" />
          <span>{wallMode ? "Zeichnen aktiv" : "Wand zeichnen"}</span>
        </button>
        {wallMode && (
          <p className="text-[11px] text-muted mt-1.5 leading-snug">
            Auf der Fläche ziehen, um eine Wand zu setzen. Mit Shift auf 15°-Winkel einrasten.
          </p>
        )}
      </div>
    </aside>
  );
}
