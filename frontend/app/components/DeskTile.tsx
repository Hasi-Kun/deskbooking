"use client";

export type DeskState = "free" | "mine" | "occupied" | "fixed" | "inactive";

/**
 * Tisch-Kachel im Querformat. Angelehnt an die Vorlage mit den weich
 * verlaufenden Farbkugeln, die beim Hover wandern - hier auf die Buchungs-
 * zustände übertragen: freie Plätze bekommen den Akzent-Verlauf, belegte
 * bleiben neutral und ruhig.
 */
export default function DeskTile({
  name, sub, state, comment,
}: { name: string; sub: string; state: DeskState; comment?: string }) {
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
        state === "fixed" ? "border-dashed border-line bg-raised" : "",
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
        <span
          className={[
            "font-mono text-[13px] font-bold leading-none tracking-tight",
            isMine ? "text-accent-ink" : "text-ink",
            isFree ? "text-free" : "",
          ].join(" ")}
        >
          {name}
        </span>
        <StateDot state={state} />
      </div>

      <span
        className={[
          "pointer-events-none relative z-10 mt-1 truncate text-[10px] leading-tight",
          isMine ? "text-accent-ink/80" : "text-muted",
        ].join(" ")}
      >
        {sub}
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
