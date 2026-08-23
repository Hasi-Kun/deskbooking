"use client";
import { useMemo, useState } from "react";
import { Booking, Desk, naturalCompare } from "@/lib/api";
import { fromISO } from "./ui/DatePicker";
import Avatar from "./ui/Avatar";
import StyledName from "./StyledName";

/**
 * Ressourcen-Tagesansicht: ein Tag, Plätze als Kacheln in einem responsiven
 * Raster (nicht mehr eine feste Reihe nebeneinander mit horizontalem
 * Scrollen - bei vielen Plätzen war das unübersichtlich). Die Kachelgröße
 * bleibt konstant, die Spaltenzahl ergibt sich automatisch aus der
 * verfügbaren Breite UND der Anzahl der Plätze (auto-fill), dazu eine
 * Suche nach Name/Zone für größere Layouts.
 */
export default function DayResourceView({
  day, desks, bookings, currentUserId,
}: {
  day: string;
  desks: Desk[];
  bookings: Booking[];
  currentUserId?: string;
}) {
  const [query, setQuery] = useState("");

  const active = useMemo(
    () => desks.filter((d) => d.is_active).sort((a, b) => naturalCompare(a.name, b.name)),
    [desks]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (d) => d.name.toLowerCase().includes(q) || d.zone.toLowerCase().includes(q)
        || (d.fixed_user_name ?? "").toLowerCase().includes(q)
    );
  }, [active, query]);

  const byDesk = new Map<string, Booking[]>();
  bookings
    .filter((b) => b.booking_date === day)
    .forEach((b) => byDesk.set(b.desk_id, [...(byDesk.get(b.desk_id) ?? []), b]));

  const dt = fromISO(day);
  const weekday = dt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">{weekday}</p>
          <p className="text-xs text-muted">
            {filtered.length === active.length
              ? `${active.length} Plätze`
              : `${filtered.length} von ${active.length} Plätzen`}
          </p>
        </div>
        {active.length > 6 && (
          <div className="relative">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tisch, Zone oder Person suchen…"
              className="w-56 rounded-lg border border-line bg-raised py-1.5 pl-8 pr-3 text-xs
                         placeholder:text-muted/60 focus-ring"
            />
          </div>
        )}
      </div>

      {active.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          Für diese Ebene sind keine Plätze angelegt.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Keine Treffer für „{query}“.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 p-3">
          {filtered.map((desk) => {
            const list = byDesk.get(desk.id) ?? [];
            const full = list.find((b) => b.slot === "full");
            const morning = list.find((b) => b.slot === "morning");
            const afternoon = list.find((b) => b.slot === "afternoon");
            const fixed = !!desk.fixed_user_id;

            return (
              <div
                key={desk.id}
                className="flex flex-col overflow-hidden rounded-xl border border-line"
              >
                <div className="flex items-center justify-between gap-1 bg-raised px-2.5 py-1.5">
                  <span className="truncate text-[11px] font-semibold tabular-nums">{desk.name}</span>
                  {desk.capacity > 1 && (
                    <span className="shrink-0 rounded px-1 text-[9px] font-semibold text-muted"
                          style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
                      {desk.capacity}
                    </span>
                  )}
                </div>

                {fixed ? (
                  <Segment
                    tone="fixed" label={desk.fixed_user_name ?? "Fest vergeben"} sub="Fest vergeben"
                    style={desk.fixed_user_style} color={desk.fixed_user_style_color} full
                  />
                ) : desk.capacity > 1 ? (
                  // Konferenztisch: mehrere zeitlich getrennte Meetings pro Tag
                  // möglich - ein einzelnes ganztags-Segment passt hier nicht
                  // mehr (siehe Uhrzeiten-Buchung). Kompakte Zusammenfassung,
                  // Details stehen im Buchungs-Panel nach Klick auf den Platz.
                  list.length === 0 ? (
                    <Segment tone="free" label="Frei" full />
                  ) : (
                    <Segment
                      tone={list.some((b) => b.user_id === currentUserId) ? "mine" : "occupied"}
                      label={`${list.length} ${list.length === 1 ? "Termin" : "Termine"}`}
                      sub={[...list]
                        .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
                        .map((b) => `${b.start_time ?? "?"}–${b.end_time ?? "?"}`)
                        .join(", ")}
                      full
                    />
                  )
                ) : full ? (
                  <Segment
                    tone={full.user_id === currentUserId ? "mine" : "occupied"}
                    label={full.user_name}
                    style={full.user_name_style} color={full.user_name_style_color}
                    sub={full.comment} full
                  />
                ) : (
                  <>
                    <Segment
                      tone={!morning ? "free" : morning.user_id === currentUserId ? "mine" : "occupied"}
                      label={morning ? morning.user_name : "Vormittag frei"}
                      style={morning?.user_name_style} color={morning?.user_name_style_color}
                      sub={morning?.comment}
                    />
                    <Segment
                      tone={!afternoon ? "free" : afternoon.user_id === currentUserId ? "mine" : "occupied"}
                      label={afternoon ? afternoon.user_name : "Nachmittag frei"}
                      style={afternoon?.user_name_style} color={afternoon?.user_name_style_color}
                      sub={afternoon?.comment}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legende - dieselben Statusfarben wie im Grundriss, damit beide
          Ansichten sich nicht widersprechen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11px] text-muted">
        <Legend cls="bg-free/25 border-free/50" label="Frei" />
        <span className="flex items-center gap-1.5"><span className="text-mine">★</span>Deine Buchung</span>
        <Legend cls="bg-occupied/25 border-occupied/50" label="Belegt" />
        <Legend cls="bg-accent/10 border-accent/40 border-dashed" label="Fest vergeben" />
      </div>
    </div>
  );
}

type Tone = "free" | "mine" | "occupied" | "fixed";

const TONE_CLS: Record<Tone, string> = {
  free: "border-free/40 bg-free/[0.07]",
  // "mine" bekommt seine Farbe per Inline-Style (siehe Segment) statt per
  // Klasse: die Farbe ist zur Laufzeit umschaltbar (fest vs. Akzent, siehe
  // Konto-Einstellung), Tailwinds /opacity-Modifikator versteht diese
  // bedingte CSS-Variable aber nicht.
  mine: "",
  occupied: "border-occupied/40 bg-occupied/[0.14]",
  fixed: "border-dashed border-accent/45 bg-accent/[0.07]",
};

function Segment({
  tone, label, sub, style, color, full,
}: {
  tone: Tone; label: string; sub?: string; style?: string; color?: string; full?: boolean;
}) {
  const isMine = tone === "mine";
  return (
    <div
      className={[
        "flex flex-col justify-center gap-0.5 border-t px-2 py-1.5 text-[10px] leading-tight",
        full ? "min-h-[60px]" : "min-h-[30px]",
        TONE_CLS[tone],
      ].join(" ")}
      style={isMine ? {
        borderColor: "color-mix(in srgb, var(--mine-active, rgb(var(--c-mine))) 45%, transparent)",
        background: "color-mix(in srgb, var(--mine-active, rgb(var(--c-mine))) 8%, transparent)",
      } : undefined}
      title={sub}
    >
      <span className="flex items-center gap-1 truncate font-medium text-ink">
        {tone !== "free" && <Avatar name={label} size={14} badge="none" />}
        {isMine && <span className="text-mine" aria-label="Deine Buchung" title="Deine Buchung">★</span>}
        <StyledName name={label} style={style} color={color} />
      </span>
      {sub && <span className="truncate text-muted">{sub}</span>}
    </div>
  );
}

function Legend({ cls = "", style, label }: { cls?: string; style?: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={`h-2.5 w-4 rounded-[3px] border ${cls}`} style={style} />
      {label}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
