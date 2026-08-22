"use client";
import { AdminUser, Desk, SceneObject } from "@/lib/api";
import AnchoredPopover from "./ui/AnchoredPopover";
import { GlowCard, CardHeader, CardBody, CardFooter } from "./ui/GlowCard";
import { ObjectIcon, OBJECT_LABELS } from "./SceneIcons";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";

type Props = {
  anchor: DOMRect | null;
  desk: Desk | null;
  object: SceneObject | null;
  people: AdminUser[];
  onClose: () => void;
  onEditDesk: (id: string, patch: Record<string, unknown>) => void;
  onEditObject: (id: string, patch: Record<string, unknown>) => void;
  onRemove: () => void;
};

/** Bearbeitungs-Panel des Editors - erscheint direkt neben dem angeklickten
 *  Element statt in einer festen Spalte am Bildschirmrand. */
export default function ElementPopover({
  anchor, desk, object, people, onClose, onEditDesk, onEditObject, onRemove,
}: Props) {
  if (!anchor || (!desk && !object)) return null;

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} width={272}>
      <GlowCard>
        <CardHeader
          icon={desk ? <DeskGlyph /> : <ObjectIcon kind={object!.kind} size={18} />}
          title={desk ? desk.name : OBJECT_LABELS[object!.kind]}
          subtitle={desk ? (desk.zone || "Arbeitsplatz") : "Einrichtung"}
          action={
            <button onClick={onClose} aria-label="Schließen"
                    className="-mr-1 rounded-md px-1.5 text-muted transition-colors hover:text-ink focus-ring">
              ✕
            </button>
          }
        />

        <CardBody className="space-y-3.5">
          {desk && (
            <>
              <Field label="Name">
                <input
                  key={desk.id + "n"} defaultValue={desk.name}
                  onBlur={(e) => e.target.value !== desk.name && onEditDesk(desk.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 font-mono text-sm focus-ring"
                />
              </Field>
              <Field label="Zone">
                <input
                  key={desk.id + "z"} defaultValue={desk.zone} placeholder="z. B. Fensterplatz"
                  onBlur={(e) => e.target.value !== desk.zone && onEditDesk(desk.id, { zone: e.target.value })}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus-ring"
                />
              </Field>
              <Field label="Fest zugewiesen an">
                <select
                  value={desk.fixed_user_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onEditDesk(desk.id, v === ""
                      ? { fixed_user_id: null, fixed_user_name: null, clear_fixed_user: true }
                      : { fixed_user_id: v, fixed_user_name: people.find((p) => p.id === v)?.full_name ?? null });
                  }}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus-ring"
                >
                  <option value="">Keiner – frei buchbar</option>
                  {people.filter((p) => p.is_active).map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </Field>
              <Checkbox
                id={`desk-active-${desk.id}`}
                checked={desk.is_active}
                onChange={(v) => onEditDesk(desk.id, { is_active: v })}
                label="Aktiv (buchbar)"
              />
            </>
          )}

          {object && (
            <>
              {object.kind === "label" && (
                <Field label="Text">
                  <input
                    key={object.id + "l"} defaultValue={object.label}
                    onBlur={(e) => e.target.value !== object.label && onEditObject(object.id, { label: e.target.value })}
                    className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus-ring"
                  />
                </Field>
              )}

              {object.kind !== "wall" && object.kind !== "window" ? (
                <>
                  <Slider label="Breite" unit="px" value={object.width} min={20} max={400} step={10}
                          onChange={(v) => onEditObject(object.id, { width: v })} />
                  <Slider label="Höhe" unit="px" value={object.height} min={20} max={400} step={10}
                          onChange={(v) => onEditObject(object.id, { height: v })} />
                  <Slider label="Drehung" unit="°" value={object.rotation} min={0} max={345} step={15}
                          onChange={(v) => onEditObject(object.id, { rotation: v })} />
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted">
                  Zum Verschieben die Linie ziehen. Die runden Griffe an den Enden
                  ändern Länge und Winkel.
                </p>
              )}
            </>
          )}
        </CardBody>

        <CardFooter>
          <Button variant="danger" size="sm" className="w-full" onClick={onRemove}>
            Entfernen
          </Button>
        </CardFooter>
      </GlowCard>
    </AnchoredPopover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Slider({
  label, unit, value, min, max, step, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-muted">{label}</label>
        <span className="font-mono text-[11px] tabular-nums text-muted">{Math.round(value)}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(+e.target.value)}
             className="w-full accent-[var(--accent)]" />
    </div>
  );
}

function DeskGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v6M19 12v6" />
      <rect x="9" y="3" width="6" height="5" rx="1" />
    </svg>
  );
}
