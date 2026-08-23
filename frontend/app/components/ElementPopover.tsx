"use client";
import { AdminUser, Desk, SceneObject } from "@/lib/api";
import PointerPopover from "./ui/PointerPopover";
import { GlowCard, CardHeader, CardBody, CardFooter } from "./ui/GlowCard";
import { ObjectIcon, OBJECT_LABELS } from "./SceneIcons";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";

type Props = {
  at: { x: number; y: number } | null;
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
  at, desk, object, people, onClose, onEditDesk, onEditObject, onRemove,
}: Props) {
  if (!at || (!desk && !object)) return null;

  return (
    <PointerPopover at={at} onClose={onClose} width={268}>
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
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm tabular-nums focus-ring"
                />
              </Field>
              <Field label="Zone">
                <input
                  key={desk.id + "z"} defaultValue={desk.zone} placeholder="z. B. Fensterplatz"
                  onBlur={(e) => e.target.value !== desk.zone && onEditDesk(desk.id, { zone: e.target.value })}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus-ring"
                />
              </Field>
              <Field label="Kapazität" hint="1 = Einzelplatz, mehr = Konferenztisch">
                <input
                  key={desk.id + "cap"} type="number" min={1} max={30}
                  defaultValue={desk.capacity}
                  onBlur={(e) => {
                    const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                    if (v !== desk.capacity) onEditDesk(desk.id, { capacity: v });
                  }}
                  className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm tabular-nums focus-ring"
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
              {desk.fixed_user_id && (
                <Field label="Büro-Tage" hint="an den anderen Tagen ist der Platz frei">
                  <WeekdayPicker
                    value={desk.fixed_days}
                    onChange={(days) => onEditDesk(desk.id, { fixed_days: days })}
                  />
                </Field>
              )}
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
    </PointerPopover>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-[11px] font-medium text-muted">{label}</label>
        {hint && <span className="text-[10px] text-muted/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Wochentags-Auswahl für "an welchen Tagen gilt die feste Zuweisung" - z.B.
 *  Büro Mo/Di/Do, Homeoffice Mi/Fr. Tage außerhalb der Auswahl gelten als
 *  frei buchbar für alle anderen. */
function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const toggle = (day: number) => {
    const set = new Set(value);
    if (set.has(day)) set.delete(day); else set.add(day);
    onChange(Array.from(set).sort());
  };
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            aria-pressed={active}
            title={active ? "Büro-Tag (Platz fest zugewiesen)" : "Frei buchbar an diesem Tag"}
            className={[
              "rounded-md py-1.5 text-[11px] font-medium transition-colors focus-ring",
              active ? "text-accent-ink" : "bg-raised text-muted hover:text-ink",
            ].join(" ")}
            style={active ? { background: "var(--accent)" } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  label, unit, value, min, max, step, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-muted">{label}</label>
        {/* Zahl direkt editierbar statt nur Anzeige - deckt sich mit dem
            "Slider + Zahlenfeld"-Muster aus den reui-Vorlagen. */}
        <div className="flex items-center gap-1">
          <input
            type="number" min={min} max={max} step={step} value={Math.round(value)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
            }}
            className="w-14 rounded-md border border-line bg-raised px-1.5 py-0.5 text-right
                       text-[11px] tabular-nums focus-ring"
          />
          <span className="text-[10px] text-muted">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="custom-range"
        style={{ ["--range-pct" as any]: `${pct}%` }}
      />
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
