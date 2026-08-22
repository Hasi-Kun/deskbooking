"use client";
import Avatar from "./ui/Avatar";
import StyledName from "./StyledName";

export type DeskState = "free" | "mine" | "occupied" | "fixed" | "inactive";

/**
 * Tisch-Kachel im Querformat. Angelehnt an die Vorlage mit den weich
 * verlaufenden Farbkugeln, die beim Hover wandern - hier auf die Buchungs-
 * zustände übertragen: freie Plätze bekommen den Akzent-Verlauf, belegte
 * bleiben neutral und ruhig.
 */
export default function DeskTile({
  name, sub, state, comment, person, personStyle, personStyleColor, capacity,
}: {
  name: string; sub: string; state: DeskState; comment?: string; person?: string;
  personStyle?: string; personStyleColor?: string;
  /** Nur bei Konferenztischen (Kapazität > 1) gesetzt - zeigt ein kleines
   *  Personen-Badge, damit sich Gruppentische im Grundriss auf einen Blick
   *  von Einzelplätzen unterscheiden lassen. */
  capacity?: number;
}) {
  const isFree = state === "free";
  const isMine = state === "mine";

  return (
    <div
      className={[
        "group/tile relative h-full w-full overflow-hidden rounded-xl border",
        "flex flex-col justify-center px-2.5 transition-all duration-500",
        isFree ? "border-free/35 bg-free/[0.06] hover:border-free/60 hover:bg-free/[0.10]" : "",
        isMine ? "border-transparent" : "",
        state === "occupied" ? "border-occupied/40 bg-occupied/[0.14]" : "",
        state === "fixed" ? "border-dashed border-accent/45 bg-accent/[0.07]" : "",
        state === "inactive" ? "border-line bg-raised opacity-40" : "",
      ].filter(Boolean).join(" ")}
      style={isMine ? { background: "var(--accent)" } : undefined}
    >
      {/* Farbkugeln: nur bei freien Plätzen, wandern beim Hover */}
      {isFree && (
        <>
          <span
            aria-hidden="true"
            className="orb -z-10 h-10 w-10 bg-free opacity-0 transition-all duration-500
                       group-hover/tile:translate-x-6 group-hover/tile:-translate-y-3 group-hover/tile:opacity-50"
            style={{ top: "60%", right: "10%" }}
          />
          <span
            aria-hidden="true"
            className="orb -z-10 h-12 w-12 opacity-0 transition-all duration-500
                       group-hover/tile:-translate-x-5 group-hover/tile:translate-y-4 group-hover/tile:opacity-35"
            style={{ background: "var(--grad-to)", top: "-15%", left: "10%" }}
          />
        </>
      )}

      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span
            className={[
              "text-[13px] font-bold leading-none tracking-tight tabular-nums truncate",
              isMine ? "text-accent-ink" : "text-ink",
              isFree ? "text-free" : "",
            ].join(" ")}
          >
            {name}
          </span>
          {/* Konferenztisch-Kennzeichen: eigenes Icon statt nur Textzusatz,
              damit die Gruppenkapazität auch bei kleiner Kachelgröße noch
              auf einen Blick erkennbar ist. */}
          {!!capacity && capacity > 1 && (
            <span
              className={[
                "flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold tabular-nums",
                isMine ? "text-accent-ink/85" : "text-muted",
              ].join(" ")}
              style={!isMine ? { background: "color-mix(in srgb, var(--accent) 12%, transparent)" } : undefined}
              title={`Konferenztisch · ${capacity} Plätze`}
            >
              <GroupIcon />
              {capacity}
            </span>
          )}
        </span>
        {state === "fixed" ? (
          <span className="rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide
                           text-accent" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
            fest
          </span>
        ) : (
          <StateDot state={state} />
        )}
      </div>

      <span
        className={[
          "pointer-events-none relative z-10 mt-1 flex items-center gap-1.5 text-[10px] leading-tight",
          isMine ? "text-accent-ink/85" : "text-muted",
        ].join(" ")}
      >
        {person && (
          <Avatar name={person} size={16} badge="none" />
        )}
        {/* Steckt der Name im Zusatztext (z.B. "Anna · vorm."), wird nur er
            eingefärbt/glitzert - der Rest bleibt schlichter Fließtext. */}
        {person && sub.startsWith(person) ? (
          <span className="truncate">
            <StyledName name={person} style={personStyle} color={personStyleColor} />
            {sub.slice(person.length)}
          </span>
        ) : (
          <span className="truncate">{sub}</span>
        )}
      </span>

      {comment && (
        <span
          className={[
            "pointer-events-none relative z-10 mt-0.5 truncate text-[9px] italic",
            isMine ? "text-accent-ink/60" : "text-muted/70",
          ].join(" ")}
        >
          {comment}
        </span>
      )}
    </div>
  );
}

function StateDot({ state }: { state: DeskState }) {
  if (state === "mine") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-ink/70" />;
  }
  if (state === "free") {
    // Bewusst die semantische Frei-Farbe, NICHT der Akzent: sonst wird der
    // Zustand unlesbar, sobald jemand einen dunklen Akzent einstellt.
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-free opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-free" />
      </span>
    );
  }
  if (state === "occupied") return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-occupied" />;
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted/50" />;
}

function GroupIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
      <path d="M16.5 8.5a3 3 0 1 0 0-5.9" />
      <path d="M20 20c0-2.9-1.9-5.2-4.5-5.9" />
    </svg>
  );
}
