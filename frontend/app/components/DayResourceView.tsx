"use client";
import { Booking, Desk } from "@/lib/api";
import { fromISO } from "./ui/DatePicker";
import Avatar from "./ui/Avatar";
import StyledName from "./StyledName";

/**
 * Ressourcen-Tagesansicht: ein Tag, Plätze als Spalten - so wie im
 * mitgeschickten Kalender-Snippet (Räume als Spalten, farbige Segmente,
 * Legende darunter). Bewusst NICHT die dort gezeigte Bibliothek (ReUI
 * Event Calendar): die baut auf date-fns/shadcn auf und ist für
 * uhrzeitgenaue Events gedacht (Check-in/-out). Unser Buchungsmodell kennt
 * nur ganztägig/vormittags/nachmittags - deshalb hier ein schlankerer
 * Nachbau desselben Grundgedankens mit den vorhandenen Bausteinen.
 */
export default function DayResourceView({
  day, desks, bookings, currentUserId,
}: {
  day: string;
  desks: Desk[];
  bookings: Booking[];
  currentUserId?: string;
}) {
  const active = desks.filter((d) => d.is_active);
  const byDesk = new Map<string, Booking[]>();
  bookings
    .filter((b) => b.booking_date === day)
    .forEach((b) => byDesk.set(b.desk_id, [...(byDesk.get(b.desk_id) ?? []), b]));

  const dt = fromISO(day);
  const weekday = dt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-sm font-medium text-ink">{weekday}</p>
        <p className="text-xs text-muted">{active.length} Plätze</p>
      </div>

      {active.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          Für diese Ebene sind keine Plätze angelegt.
        </p>
      ) : (
        <div className="overflow-x-auto thin-scroll">
          <div className="flex gap-2.5 p-3">
            {active.map((desk) => {
              const list = byDesk.get(desk.id) ?? [];
              const full = list.find((b) => b.slot === "full");
              const morning = list.find((b) => b.slot === "morning");
              const afternoon = list.find((b) => b.slot === "afternoon");
              const fixed = !!desk.fixed_user_id;

              return (
                <div
                  key={desk.id}
                  className="flex w-[132px] shrink-0 flex-col overflow-hidden rounded-xl border border-line"
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
                    <Segment tone="fixed" label="Fest vergeben" sub={desk.fixed_user_name ?? undefined} full />
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
        </div>
      )}

      {/* Legende - dieselben Statusfarben wie im Grundriss, damit beide
          Ansichten sich nicht widersprechen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-[11px] text-muted">
        <Legend cls="bg-free/25 border-free/50" label="Frei" />
        <Legend style={{ background: "var(--accent)" }} label="Deine Buchung" />
        <Legend cls="bg-occupied/25 border-occupied/50" label="Belegt" />
        <Legend cls="bg-accent/10 border-accent/40 border-dashed" label="Fest vergeben" />
      </div>
    </div>
  );
}

type Tone = "free" | "mine" | "occupied" | "fixed";

const TONE_CLS: Record<Tone, string> = {
  free: "border-free/40 bg-free/[0.07]",
  mine: "border-transparent",
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
      style={isMine ? { background: "var(--accent)" } : undefined}
      title={sub}
    >
      <span className={["flex items-center gap-1 truncate font-medium", isMine ? "text-accent-ink" : "text-ink"].join(" ")}>
        {tone !== "free" && <Avatar name={label} size={14} badge="none" />}
        <StyledName name={label} style={style} color={color} />
      </span>
      {sub && (
        <span className={["truncate italic", isMine ? "text-accent-ink/70" : "text-muted"].join(" ")}>{sub}</span>
      )}
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
