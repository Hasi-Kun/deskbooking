"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Desk, Floor, Booking, SceneObject } from "@/lib/api";
import { ObjectIcon } from "./SceneIcons";
import DeskTile, { DeskState } from "./DeskTile";
import type { PaletteItem } from "./InventoryPalette";

const TILE_W = 92;
const TILE_H = 54;
const GRID = 20;

export type Selection = { type: "desk" | "object"; id: string } | null;

type ViewProps = {
  mode: "view";
  floor: Floor;
  desks: Desk[];
  objects: SceneObject[];
  bookingByDesk: Map<string, Booking[]>;
  currentUserId: string;
  onDeskClick: (desk: Desk, bookings: Booking[], rect: DOMRect) => void;
  /** Feste Plätze, deren zugewiesene Person heute im Urlaub ist - gelten für
   *  diesen Tag als frei buchbar statt blockiert. */
  absentFixedDeskIds?: Set<string>;
};

type BuilderProps = {
  mode: "builder";
  floor: Floor;
  desks: Desk[];
  objects: SceneObject[];
  selection: Selection;
  wallMode: boolean;
  onSelect: (sel: Selection) => void;
  /** Rechtsklick auf ein Element: öffnet die Eigenschaften an der Mausposition. */
  onContext: (sel: Selection, at: { x: number; y: number }) => void;
  onMoveDesk: (id: string, x: number, y: number) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onMoveWall: (id: string, x1: number, y1: number, x2: number, y2: number) => void;
  onDropItem: (item: PaletteItem, x: number, y: number) => void;
  onDrawWall: (x1: number, y1: number, x2: number, y2: number) => void;
  onRequestDelete?: () => void;
};

type Props = ViewProps | BuilderProps;

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Was gerade gezogen wird. Wände kennen zusätzlich Endpunkt-Anfasser. */
type DragState =
  | { kind: "desk" | "object"; id: string; dx: number; dy: number }
  | { kind: "wall-move"; id: string; dx: number; dy: number; len: { x: number; y: number } }
  | { kind: "wall-end"; id: string; end: 1 | 2 }
  | null;

export default function FloorCanvas(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<DragState>(null);
  const [wallDraft, setWallDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isOver, setIsOver] = useState(false);

  const { floor, desks, objects } = props;
  const builder = props.mode === "builder" ? props : null;

  // Die Zeichenfläche behält ihre logischen Maße und wird auf die verfügbare
  // Breite herunterskaliert. So bleiben Koordinaten stabil, während die Box
  // sich an jede Fenstergröße anpasst.
  // Entf / Rücktaste löscht das ausgewählte Element - solange der Fokus nicht
  // in einem Eingabefeld steht.
  useEffect(() => {
    if (!builder?.onRequestDelete) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && builder.selection) {
        e.preventDefault();
        builder.onRequestDelete!();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Zoom: "fit" passt die Fläche in die verfügbare Breite ein (nie über 100 %),
  // ein Zahlenwert setzt einen festen Faktor. Die logischen Koordinaten bleiben
  // dabei unverändert - nur die Darstellung ändert sich.
  const [zoomMode, setZoomMode] = useState<"fit" | number>("fit");
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const available = wrap.clientWidth - 2;   // Rahmen abziehen
      setFitScale(Math.max(0.2, Math.min(1, available / floor.width)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [floor.width]);

  useEffect(() => {
    setScale(zoomMode === "fit" ? fitScale : zoomMode);
  }, [zoomMode, fitScale]);

  /** Mausposition in logische Canvas-Koordinaten umrechnen (Skalierung beachten). */
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };
  const clampX = (v: number) => Math.max(0, Math.min(floor.width, v));
  const clampY = (v: number) => Math.max(0, Math.min(floor.height, v));

  function beginDrag(e: React.PointerEvent, state: NonNullable<DragState>) {
    if (!builder || builder.wallMode) return;
    // Nur der primäre Zeigerknopf (Linksklick/Touch) startet ein Ziehen.
    // Ohne diese Prüfung fängt setPointerCapture() auch den Rechtsklick ab,
    // BEVOR das contextmenu-Ereignis den Browser erreicht - das Kontextmenü
    // ging dadurch nie auf.
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag(state);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!builder) return;
    const p = localPoint(e);

    if (wallDraft) {
      let x2 = clampX(p.x);
      let y2 = clampY(p.y);
      if (e.shiftKey) {
        const dx = x2 - wallDraft.x1;
        const dy = y2 - wallDraft.y1;
        const len = Math.hypot(dx, dy);
        const step = Math.PI / 12;
        const ang = Math.round(Math.atan2(dy, dx) / step) * step;
        x2 = wallDraft.x1 + Math.cos(ang) * len;
        y2 = wallDraft.y1 + Math.sin(ang) * len;
      }
      setWallDraft({ ...wallDraft, x2, y2 });
      return;
    }
    if (!drag) return;

    if (drag.kind === "desk" || drag.kind === "object") {
      const el = canvasRef.current!.querySelector<HTMLElement>(`[data-id="${drag.id}"]`);
      if (el) {
        el.style.left = `${clampX(snap(p.x - drag.dx))}px`;
        el.style.top = `${clampY(snap(p.y - drag.dy))}px`;
      }
    }
    // Wände werden über den React-State live aktualisiert (SVG-Linie)
    if (drag.kind === "wall-move") {
      const nx = clampX(snap(p.x - drag.dx));
      const ny = clampY(snap(p.y - drag.dy));
      builder.onMoveWall(drag.id, nx, ny, nx + drag.len.x, ny + drag.len.y);
    }
    if (drag.kind === "wall-end") {
      const w = objects.find((o) => o.id === drag.id);
      if (!w) return;
      const nx = clampX(snap(p.x));
      const ny = clampY(snap(p.y));
      if (drag.end === 1) builder.onMoveWall(w.id, nx, ny, w.x2 ?? nx, w.y2 ?? ny);
      else builder.onMoveWall(w.id, w.pos_x, w.pos_y, nx, ny);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!builder) return;
    if (wallDraft) {
      const len = Math.hypot(wallDraft.x2 - wallDraft.x1, wallDraft.y2 - wallDraft.y1);
      if (len > 16) {
        builder.onDrawWall(snap(wallDraft.x1), snap(wallDraft.y1), snap(wallDraft.x2), snap(wallDraft.y2));
      }
      setWallDraft(null);
      return;
    }
    if (!drag) return;
    if (drag.kind === "desk" || drag.kind === "object") {
      const p = localPoint(e);
      const x = clampX(snap(p.x - drag.dx));
      const y = clampY(snap(p.y - drag.dy));
      if (drag.kind === "desk") builder.onMoveDesk(drag.id, x, y);
      else builder.onMoveObject(drag.id, x, y);
    }
    setDrag(null);
  }

  function handlePointerDownCanvas(e: React.PointerEvent) {
    if (!builder) return;
    if (builder.wallMode) {
      const p = localPoint(e);
      setWallDraft({ x1: snap(p.x), y1: snap(p.y), x2: snap(p.x), y2: snap(p.y) });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (e.target === canvasRef.current) builder.onSelect(null);
  }

  function handleDrop(e: React.DragEvent) {
    if (!builder) return;
    e.preventDefault();
    setIsOver(false);
    const raw = e.dataTransfer.getData("application/x-deskbooking-item");
    if (!raw) return;
    try {
      const item: PaletteItem = JSON.parse(raw);
      const p = localPoint(e);
      builder.onDropItem(item, clampX(snap(p.x)), clampY(snap(p.y)));
    } catch {
      /* ungültige Nutzlast ignorieren */
    }
  }

  const walls = objects.filter((o) => o.kind === "wall" || o.kind === "window");
  const furniture = objects.filter((o) => o.kind !== "wall" && o.kind !== "window");

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Der äußere Rahmen wächst weich mit; bei Zoom > Fit wird gescrollt. */}
      <div
        className="thin-scroll overflow-auto rounded-2xl border border-line bg-surface
                   transition-[height] duration-300 ease-out"
        style={{ height: Math.min(floor.height * scale, 760) + 2 }}
      >
        <div
          style={{ width: floor.width * scale, height: floor.height * scale }}
          className="relative transition-[width,height] duration-300 ease-out"
        >
        <div
          ref={canvasRef}
          // Nur im Editor vom globalen Rechtsklick-Verbot ausnehmen (siehe
          // ContextMenuGuard) - die Elemente hier rufen Rechtsklick-Handler
          // für ihr Eigenschaften-Panel auf, das braucht ein echtes contextmenu.
          data-allow-context-menu={builder ? "true" : undefined}
          onPointerDown={handlePointerDownCanvas}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={(e) => { if (builder) { e.preventDefault(); setIsOver(true); } }}
          onDragLeave={() => setIsOver(false)}
          onDrop={handleDrop}
          // Rechtsklick auf die leere Fläche (nicht auf ein Element) soll nie
          // das Browser-eigene Kontextmenü zeigen - weder im Editor noch in
          // der reinen Ansicht. Elemente mit einem eigenen Kontextmenü rufen
          // preventDefault() bereits selbst auf; das hier ist die Absicherung
          // für die Fläche darunter/dazwischen.
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: floor.width,
            height: floor.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            // Das Punktraster ist Hintergrund DIESER Fläche - es wächst also
            // automatisch mit, wenn Breite/Höhe geändert werden.
            backgroundImage: "radial-gradient(circle, rgb(var(--c-line)) 1px, transparent 1px)",
            backgroundSize: `${GRID}px ${GRID}px`,
            cursor: builder?.wallMode ? "crosshair" : "default",
            touchAction: "none",
          }}
          className={[
            "transition-[width,height,transform] duration-300 ease-out",
            isOver ? "ring-2 ring-inset ring-accent/60" : "",
          ].join(" ")}
        >
          {/* Wände + Fenster */}
          <svg width={floor.width} height={floor.height} className="absolute inset-0 pointer-events-none">
            <defs>
              <linearGradient id="wall-accent" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            {walls.map((w) => {
              const selected = builder?.selection?.id === w.id;
              const x2 = w.x2 ?? w.pos_x;
              const y2 = w.y2 ?? w.pos_y;
              if (w.kind === "window") {
                // Fenster: dünne, umrandete Fläche (Rechteck entlang der
                // Wandachse, Mitte leer) statt einer dicken Linie wie bei
                // einer Wand - dadurch auf einen Blick als Öffnung erkennbar,
                // nicht als weiteres Wandstück.
                const dx = x2 - w.pos_x, dy = y2 - w.pos_y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len, uy = dy / len;
                const px = -uy, py = ux;
                const half = 4.5;
                const pts = [
                  [w.pos_x + px * half, w.pos_y + py * half],
                  [x2 + px * half, y2 + py * half],
                  [x2 - px * half, y2 - py * half],
                  [w.pos_x - px * half, w.pos_y - py * half],
                ].map((p) => p.join(",")).join(" ");
                return (
                  <polygon
                    key={w.id}
                    points={pts}
                    fill="none"
                    stroke={selected ? "url(#wall-accent)" : "rgb(var(--c-window))"}
                    strokeWidth={selected ? 2.5 : 1.75}
                    strokeLinejoin="round"
                    opacity={selected ? 1 : 0.8}
                  />
                );
              }
              return (
                <line
                  key={w.id}
                  x1={w.pos_x} y1={w.pos_y} x2={x2} y2={y2}
                  stroke={selected ? "url(#wall-accent)" : "rgb(var(--c-ink))"}
                  strokeWidth={selected ? 9 : 8}
                  strokeLinecap="round"
                  opacity={selected ? 1 : 0.85}
                />
              );
            })}
            {wallDraft && (
              <line x1={wallDraft.x1} y1={wallDraft.y1} x2={wallDraft.x2} y2={wallDraft.y2}
                    stroke="url(#wall-accent)" strokeWidth={8} strokeLinecap="round" strokeDasharray="10 7" />
            )}
          </svg>

          {/* Klick-/Ziehfläche über die GESAMTE Wandlänge (nicht nur die Mitte) */}
          {builder && walls.map((w) => {
            const x2 = w.x2 ?? w.pos_x;
            const y2 = w.y2 ?? w.pos_y;
            const dx = x2 - w.pos_x;
            const dy = y2 - w.pos_y;
            const len = Math.hypot(dx, dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const selected = builder.selection?.id === w.id;
            return (
              <div key={`hit-${w.id}`}>
                <div
                  onPointerDown={(e) => {
                    // Immer stoppen: sonst startet der Canvas darunter im
                    // Zeichenmodus eine neue Wand und die Auswahl geht verloren.
                    e.stopPropagation();
                    const p = localPoint(e);
                    builder.onSelect({ type: "object", id: w.id });
                    // Ziehen nur ausserhalb des Zeichenmodus - im Zeichenmodus
                    // soll ein Klick die Wand lediglich auswaehlen.
                    if (!builder.wallMode) {
                      beginDrag(e, {
                        kind: "wall-move", id: w.id,
                        dx: p.x - w.pos_x, dy: p.y - w.pos_y,
                        len: { x: dx, y: dy },
                      });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    builder.onSelect({ type: "object", id: w.id });
                    builder.onContext({ type: "object", id: w.id }, { x: e.clientX, y: e.clientY });
                  }}
                  title={w.kind === "window" ? "Fenster – ziehen zum Verschieben, Rechtsklick für Eigenschaften" : "Wand – ziehen zum Verschieben, Rechtsklick für Eigenschaften"}
                  style={{
                    position: "absolute",
                    left: w.pos_x, top: w.pos_y,
                    width: len, height: 18,
                    transform: `translateY(-50%) rotate(${angle}deg)`,
                    transformOrigin: "0 50%",
                  }}
                  className="cursor-grab active:cursor-grabbing rounded-full transition-colors
                             hover:bg-accent/15"
                />
                {/* Endpunkt-Anfasser zum Verformen */}
                {selected && ([[w.pos_x, w.pos_y, 1], [x2, y2, 2]] as [number, number, 1 | 2][]).map(([hx, hy, end]) => (
                  <div
                    key={end}
                    onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, { kind: "wall-end", id: w.id, end }); }}
                    aria-label={`Endpunkt ${end}`}
                    className="h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full
                               border-2 bg-surface transition-transform hover:scale-125"
                    style={{ position: "absolute", left: hx, top: hy, borderColor: "var(--accent)" }}
                  />
                ))}
              </div>
            );
          })}

          {/* Möbel, Pflanzen, Beschriftungen */}
          {furniture.map((o) => {
            const selected = builder?.selection?.type === "object" && builder.selection.id === o.id;
            return (
              <div
                key={o.id}
                data-id={o.id}
                onPointerDown={(e) => {
                  if (!builder) return;
                  const p = localPoint(e);
                  builder.onSelect({ type: "object", id: o.id });
                  beginDrag(e, { kind: "object", id: o.id, dx: p.x - o.pos_x, dy: p.y - o.pos_y });
                }}
                className={[
                  "absolute grid place-items-center rounded-xl border transition-colors duration-200",
                  builder ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
                  selected ? "border-accent/60 ring-2 ring-accent/40" : "border-line",
                  o.kind === "label" ? "border-dashed bg-transparent" : "bg-raised",
                ].join(" ")}
                style={{
                  left: o.pos_x, top: o.pos_y, width: o.width, height: o.height,
                  transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
                }}
                onContextMenu={(e) => {
                  if (!builder) return;
                  e.preventDefault();
                  builder.onSelect({ type: "object", id: o.id });
                  builder.onContext({ type: "object", id: o.id }, { x: e.clientX, y: e.clientY });
                }}
                title={o.label || undefined}
              >
                {o.kind === "label" ? (
                  <span className="pointer-events-none truncate px-1 text-[11px] font-medium text-muted">
                    {o.label || "Beschriftung"}
                  </span>
                ) : (
                  <span className="pointer-events-none text-muted">
                    <ObjectIcon kind={o.kind} size={Math.max(14, Math.min(o.width, o.height) * 0.5)} />
                  </span>
                )}
              </div>
            );
          })}

          {/* Arbeitsplätze */}
          {desks.map((desk) => {
            let state: DeskState = "free";
            let sub = "Frei";
            let booking: Booking | undefined;

            if (props.mode === "view") {
              const list = props.bookingByDesk.get(desk.id) ?? [];
              // Die eigene Buchung hat Vorrang in der Anzeige.
              booking = list.find((b) => b.user_id === props.currentUserId) ?? list[0];
              const absent = !!desk.fixed_user_id && props.absentFixedDeskIds?.has(desk.id);
              if (!desk.is_active) { state = "inactive"; sub = "Nicht verfügbar"; }
              else if (desk.fixed_user_id && !absent) { state = "fixed"; sub = "Fest vergeben"; }
              else if (desk.capacity > 1) {
                // Konferenztisch: mehrere zeitlich getrennte Meetings pro Tag
                // möglich - ein einzelner "belegt/frei"-Zustand für den
                // ganzen Tag ergibt hier keinen Sinn mehr. Bleibt bewusst
                // "buchbar"; welche Zeiten schon vergeben sind, zeigt erst
                // das Detail-Panel nach dem Klick.
                state = "free";
                booking = undefined;
                sub = list.length > 0 ? `${list.length} ${list.length === 1 ? "Termin" : "Termine"} heute` : "";
              }
              else if (booking) {
                state = booking.user_id === props.currentUserId ? "mine" : "occupied";
                const half = list.filter((b) => b.slot !== "full");
                if (state === "mine") {
                  sub = "Dein Platz";
                } else if (half.length === 2) {
                  // Vor- und Nachmittag getrennt vergeben
                  sub = "Vor-/Nachmittag belegt";
                } else if (booking.slot === "morning") {
                  sub = "Vormittags belegt";
                } else if (booking.slot === "afternoon") {
                  sub = "Nachmittags belegt";
                } else {
                  // Wer genau dort sitzt, steht erst im aufgeklappten Buchungs-
                  // Panel - im Grundriss reicht das Avatar zur Wiedererkennung.
                  sub = "Belegt";
                }
              } else if (absent) {
                sub = "Frei (heute nicht im Büro)";
              }
            } else {
              if (!desk.is_active) { state = "inactive"; sub = "Inaktiv"; }
              else if (desk.fixed_user_id) { state = "fixed"; sub = `Fest: ${desk.fixed_user_name}`; }
              else sub = desk.zone || "Buchbar";
            }

            const selected = builder?.selection?.type === "desk" && builder.selection.id === desk.id;
            const clickable = props.mode === "view" && state !== "inactive";
            // Konferenztische (Kapazität > 1) bekommen eine größere Kachel,
            // damit sie sich im Grundriss optisch von Einzelplätzen abheben
            // und sich mehrere Namen/die Personenzahl lesbar unterbringen lassen.
            const isMeeting = desk.capacity > 1;
            const tileW = isMeeting ? 150 : TILE_W;
            const tileH = isMeeting ? 84 : TILE_H;

            return (
              <div
                key={desk.id}
                data-id={desk.id}
                role={props.mode === "view" ? "button" : undefined}
                tabIndex={clickable ? 0 : -1}
                onPointerDown={(e) => {
                  if (!builder) return;
                  const p = localPoint(e);
                  builder.onSelect({ type: "desk", id: desk.id });
                  beginDrag(e, { kind: "desk", id: desk.id, dx: p.x - desk.pos_x, dy: p.y - desk.pos_y });
                }}
                onClick={(e) => {
                  if (props.mode === "view" && clickable) {
                    props.onDeskClick(desk, props.bookingByDesk.get(desk.id) ?? [], (e.currentTarget as HTMLElement).getBoundingClientRect());
                  }
                }}
                onContextMenu={(e) => {
                  if (!builder) return;
                  e.preventDefault();
                  builder.onSelect({ type: "desk", id: desk.id });
                  builder.onContext({ type: "desk", id: desk.id }, { x: e.clientX, y: e.clientY });
                }}
                onKeyDown={(e) => {
                  if (props.mode === "view" && clickable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    props.onDeskClick(desk, props.bookingByDesk.get(desk.id) ?? [], (e.currentTarget as HTMLElement).getBoundingClientRect());
                  }
                }}
                className={[
                  "absolute transition-transform duration-200 focus-ring rounded-xl",
                  builder ? "cursor-grab active:cursor-grabbing" : "",
                  clickable ? "cursor-pointer hover:-translate-y-0.5" : "",
                  selected ? "ring-2 ring-accent/60" : "",
                ].filter(Boolean).join(" ")}
                style={{
                  left: desk.pos_x, top: desk.pos_y,
                  width: tileW, height: tileH,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <DeskTile
                  name={desk.name}
                  sub={props.mode === "view" ? "" : sub}
                  state={state}
                  capacity={isMeeting ? desk.capacity : undefined}
                  person={
                    state === "occupied" ? booking?.user_name
                    : state === "fixed" ? desk.fixed_user_name ?? undefined
                    : undefined
                  }
                />
              </div>
            );
          })}

          {desks.length === 0 && objects.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="text-sm text-muted">
                {builder ? "Elemente aus der Leiste hierher ziehen" : "Für diese Ebene ist noch nichts angelegt"}
              </p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Zoom-Steuerung - nur im Editor */}
      {builder && (
        <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1
                        rounded-full border border-line bg-surface/90 px-1 py-1 shadow-lg backdrop-blur
                        transition-opacity duration-200">
          <ZoomButton onClick={() => setZoomMode(Math.max(0.25, +(scale - 0.1).toFixed(2)))} label="Verkleinern">
            −
          </ZoomButton>
          <button
            onClick={() => setZoomMode(zoomMode === "fit" ? 1 : "fit")}
            title={zoomMode === "fit" ? "Auf 100 % setzen" : "Einpassen"}
            className="min-w-[52px] rounded-full px-2 py-1 text-[11px] font-medium tabular-nums
                       text-muted transition-colors hover:bg-raised hover:text-ink focus-ring"
          >
            {zoomMode === "fit" ? "Fit" : `${Math.round(scale * 100)}%`}
          </button>
          <ZoomButton onClick={() => setZoomMode(Math.min(2, +(scale + 0.1).toFixed(2)))} label="Vergrößern">
            +
          </ZoomButton>
        </div>
      )}
    </div>
  );
}

function ZoomButton({
  onClick, label, children,
}: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded-full text-sm text-muted
                 transition-all duration-200 hover:bg-raised hover:text-ink active:scale-90 focus-ring"
    >
      {children}
    </button>
  );
}
