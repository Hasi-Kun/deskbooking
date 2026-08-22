"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, AdminUser, Desk, Floor, SceneObject, User } from "@/lib/api";
import AppShell from "../../components/AppShell";
import { useAppData } from "../../components/AppDataProvider";
import FloorCanvas, { Selection } from "../../components/FloorCanvas";
import InventoryPalette, { PaletteItem } from "../../components/InventoryPalette";
import { OBJECT_DEFAULTS } from "../../components/SceneIcons";
import ElementPopover from "../../components/ElementPopover";
import Button from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";

/** Gesammelte, noch nicht gespeicherte Aenderungen. Positionen werden beim
 *  Ziehen nur lokal gehalten und erst beim Speichern gebuendelt geschrieben -
 *  das vermeidet einen Server-Aufruf pro Mausbewegung. */
type Pending = {
  desks: Map<string, Partial<Desk>>;
  objects: Map<string, Partial<SceneObject>>;
  floor: Partial<Floor> | null;
};

const emptyPending = (): Pending => ({ desks: new Map(), objects: new Map(), floor: null });

const SIZE_PRESETS = [
  { label: "Klein", width: 800, height: 500 },
  { label: "Mittel", width: 1200, height: 750 },
  { label: "Groß", width: 1800, height: 1100 },
];

export default function LayoutBuilder() {
  const router = useRouter();
  const { ensure, setFloors: cacheFloors, invalidate } = useAppData();
  const [user, setUser] = useState<User | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const [newFloor, setNewFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const pending = useRef<Pending>(emptyPending());
  const [dirty, setDirty] = useState(false);

  const markDirty = () => setDirty(true);

  const load = useCallback(async (fId: string) => {
    const [d, o] = await Promise.all([
      api<Desk[]>(`/api/desks?floor_id=${fId}`),
      api<SceneObject[]>(`/api/scene?floor_id=${fId}`),
    ]);
    setDesks(d);
    setObjects(o);
    pending.current = emptyPending();
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cache = await ensure({ user: true, floors: true, people: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        if (cache.user.role !== "admin") { router.replace("/dashboard"); return; }
        setUser(cache.user);
        setFloors(cache.floors);
        setPeople(cache.people);
        const first = cache.floors[0]?.id ?? null;
        setFloorId(first);
        if (first) await load(first);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (floorId) load(floorId).catch(() => setError("Layout konnte nicht geladen werden"));
  }, [floorId, load]);

  // Vor dem Verlassen warnen, solange Ungespeichertes offen ist
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Strg+S speichern, Entf löscht die Auswahl
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In Eingabefeldern nicht eingreifen
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (!typing && (e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        void removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fail = (e: unknown) => setError((e as ApiError)?.message || "Aktion fehlgeschlagen");

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    const p = pending.current;
    try {
      const calls: Promise<unknown>[] = [];
      p.desks.forEach((patch, id) => {
        // fixed_user_name ist ein reines Anzeigefeld (kommt vom Server zurueck,
        // wird aber nicht entgegengenommen) - vor dem Senden entfernen.
        const { fixed_user_name, ...body } = patch as Record<string, unknown>;
        calls.push(api(`/api/desks/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
      });
      p.objects.forEach((patch, id) =>
        calls.push(api(`/api/scene/${id}`, { method: "PATCH", body: JSON.stringify(patch) }))
      );
      if (p.floor && floorId) {
        calls.push(api(`/api/floors/${floorId}`, { method: "PATCH", body: JSON.stringify(p.floor) }));
      }
      await Promise.all(calls);
      pending.current = emptyPending();
      setDirty(false);
      setSavedAt(new Date());
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function createFloor(e: React.FormEvent) {
    e.preventDefault();
    if (!newFloor.trim()) return;
    try {
      const f = await api<Floor>("/api/floors", {
        method: "POST",
        body: JSON.stringify({ name: newFloor.trim(), width: 1200, height: 750 }),
      });
      setFloors((prev) => {
        const next = [...prev, f];
        cacheFloors(next);   // Cache mitziehen, sonst fehlt sie auf anderen Seiten
        return next;
      });
      setFloorId(f.id);
      setNewFloor("");
    } catch (e) { fail(e); }
  }

  // --- Anlegen (sofort auf dem Server, damit es eine ID gibt) ---
  async function handleDrop(item: PaletteItem, x: number, y: number) {
    if (!floorId) return;
    try {
      if (item.kind === "desk") {
        const desk = await api<Desk>("/api/desks", {
          method: "POST",
          body: JSON.stringify({
            name: `D-${String(desks.length + 1).padStart(2, "0")}`,
            floor_id: floorId, pos_x: x, pos_y: y,
          }),
        });
        setDesks((p) => [...p, desk]);
        setSelection({ type: "desk", id: desk.id });
      } else {
        const size = OBJECT_DEFAULTS[item.objectKind];
        const obj = await api<SceneObject>("/api/scene", {
          method: "POST",
          body: JSON.stringify({
            floor_id: floorId, kind: item.objectKind, pos_x: x, pos_y: y,
            width: size.width, height: size.height,
            label: item.objectKind === "label" ? "Bereich" : "",
          }),
        });
        setObjects((p) => [...p, obj]);
        setSelection({ type: "object", id: obj.id });
      }
    } catch (e) { fail(e); }
  }

  async function drawWall(x1: number, y1: number, x2: number, y2: number) {
    if (!floorId) return;
    try {
      const obj = await api<SceneObject>("/api/scene", {
        method: "POST",
        body: JSON.stringify({ floor_id: floorId, kind: "wall", pos_x: x1, pos_y: y1, x2, y2 }),
      });
      setObjects((p) => [...p, obj]);
    } catch (e) { fail(e); }
  }

  // --- Änderungen: nur lokal + vormerken ---
  function moveDesk(id: string, x: number, y: number) {
    setDesks((p) => p.map((d) => (d.id === id ? { ...d, pos_x: x, pos_y: y } : d)));
    pending.current.desks.set(id, { ...pending.current.desks.get(id), pos_x: x, pos_y: y });
    markDirty();
  }

  function moveWall(id: string, x1: number, y1: number, x2: number, y2: number) {
    setObjects((p) => p.map((o) => (o.id === id ? { ...o, pos_x: x1, pos_y: y1, x2, y2 } : o)));
    pending.current.objects.set(id, {
      ...pending.current.objects.get(id), pos_x: x1, pos_y: y1, x2, y2,
    });
    markDirty();
  }

  function moveObject(id: string, x: number, y: number) {
    setObjects((p) => p.map((o) => (o.id === id ? { ...o, pos_x: x, pos_y: y } : o)));
    pending.current.objects.set(id, { ...pending.current.objects.get(id), pos_x: x, pos_y: y });
    markDirty();
  }

  function editDesk(id: string, patch: Record<string, unknown>) {
    setDesks((p) => p.map((d) => (d.id === id ? { ...d, ...patch } as Desk : d)));
    pending.current.desks.set(id, { ...pending.current.desks.get(id), ...patch });
    markDirty();
  }

  function editObject(id: string, patch: Record<string, unknown>) {
    setObjects((p) => p.map((o) => (o.id === id ? { ...o, ...patch } as SceneObject : o)));
    pending.current.objects.set(id, { ...pending.current.objects.get(id), ...patch });
    markDirty();
  }

  function resizeFloor(width: number, height: number) {
    setFloors((p) => p.map((f) => (f.id === floorId ? { ...f, width, height } : f)));
    pending.current.floor = { ...pending.current.floor, width, height };
    markDirty();
  }

  async function removeSelected() {
    if (!selection) return;
    // Bewusst ohne Rueckfrage - der Editor ist ein Arbeitswerkzeug, staendige
    // Bestaetigungen bremsen. Versehentlich Geloeschtes ist schnell neu gesetzt.
    try {
      if (selection.type === "desk") {
        await api(`/api/desks/${selection.id}?hard=true`, { method: "DELETE" });
        setDesks((p) => p.filter((d) => d.id !== selection.id));
        pending.current.desks.delete(selection.id);
      } else {
        await api(`/api/scene/${selection.id}`, { method: "DELETE" });
        setObjects((p) => p.filter((o) => o.id !== selection.id));
        pending.current.objects.delete(selection.id);
      }
      setSelection(null);
      setAnchorRect(null);
    } catch (e) { fail(e); }
  }

  const currentFloor = floors.find((f) => f.id === floorId);
  const selDesk = selection?.type === "desk" ? desks.find((d) => d.id === selection.id) ?? null : null;
  const selObject = selection?.type === "object" ? objects.find((o) => o.id === selection.id) ?? null : null;
  const hasPanel = !!(selDesk || selObject);

  if (loading) {
    return <AppShell user={null}><Skeleton className="h-96 w-full rounded-xl2" /></AppShell>;
  }

  return (
    <AppShell user={user}>
      {/* Kopfzeile: Ebenen + Speichern */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {floors.map((f) => (
            <Button
              key={f.id} size="sm"
              variant={f.id === floorId ? "primary" : "secondary"}
              onClick={() => {
                if (dirty && !confirm("Ungespeicherte Änderungen gehen verloren. Trotzdem wechseln?")) return;
                setFloorId(f.id);
                setSelection(null);
                setAnchorRect(null);
              }}
            >
              {f.name}
            </Button>
          ))}
          <form onSubmit={createFloor} className="flex gap-1">
            <input
              value={newFloor}
              onChange={(e) => setNewFloor(e.target.value)}
              placeholder="Neue Ebene…"
              className="w-32 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs focus-ring"
            />
            <Button size="sm" type="submit" aria-label="Ebene anlegen">+</Button>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">
            {dirty
              ? "Nicht gespeichert"
              : savedAt
              ? `Gespeichert ${savedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
          <Button
            variant="primary" size="sm" loading={saving} disabled={!dirty}
            onClick={save} title="Strg + S"
          >
            Speichern
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-lg border
                                     border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Schließen" className="focus-ring rounded">✕</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[196px_1fr]">
        <InventoryPalette
          wallMode={wallMode}
          onToggleWallMode={() => { setWallMode((v) => !v); setSelection(null); setAnchorRect(null); }}
        />

        <div className="min-w-0 space-y-2">
          {/* Grundriss-Größe */}
          {currentFloor && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Fläche</span>
              <SizeControl
                label="Breite" value={currentFloor.width} min={400} max={4000}
                onChange={(v) => resizeFloor(v, currentFloor.height)}
              />
              <SizeControl
                label="Höhe" value={currentFloor.height} min={300} max={4000}
                onChange={(v) => resizeFloor(currentFloor.width, v)}
              />
              <div className="flex gap-1">
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => resizeFloor(p.width, p.height)}
                    className={[
                      "rounded-md border px-2 py-1 text-[11px] transition-colors focus-ring",
                      currentFloor.width === p.width && currentFloor.height === p.height
                        ? "border-accent/50 text-ink"
                        : "border-line text-muted hover:bg-raised hover:text-ink",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[11px] text-muted">
                {desks.length} Plätze · {objects.length} Objekte
              </span>
            </div>
          )}

          {currentFloor ? (
            <FloorCanvas
              mode="builder"
              floor={currentFloor}
              desks={desks}
              objects={objects}
              selection={selection}
              wallMode={wallMode}
              onSelect={(sel, rect) => {
                setSelection(sel);
                setAnchorRect(sel ? rect ?? null : null);
              }}
              onMoveDesk={moveDesk}
              onMoveObject={moveObject}
              onMoveWall={moveWall}
              onDropItem={handleDrop}
              onDrawWall={drawWall}
            />
          ) : (
            <p className="text-sm text-muted">Lege zuerst eine Ebene an.</p>
          )}
          <p className="text-[11px] text-muted">
            Positionen rasten am 20-px-Raster ein. Änderungen mit „Speichern" (Strg + S) übernehmen.
          </p>
        </div>

      </div>

      <ElementPopover
        anchor={anchorRect}
        desk={selDesk}
        object={selObject}
        people={people}
        onClose={() => { setSelection(null); setAnchorRect(null); }}
        onEditDesk={editDesk}
        onEditObject={editObject}
        onRemove={removeSelected}
      />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
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
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-xs font-medium text-muted">{label}</label>
        <span className="font-mono text-[11px] text-muted tabular-nums">{Math.round(value)}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function SizeControl({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 text-[11px] text-muted">{label}</span>
      {/* Regler wirkt sofort - die Fläche wächst live mit, ohne Bestätigen */}
      <input
        type="range" min={min} max={max} step={20} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-24 accent-[var(--accent)]"
        aria-label={label}
      />
      <input
        type="number" value={value} min={min} max={max} step={20}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-[64px] rounded-md border border-line bg-raised px-1.5 py-1 text-xs tabular-nums
                   transition-colors focus-ring"
      />
    </div>
  );
}
