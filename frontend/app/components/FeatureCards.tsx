"use client";

type Feature = {
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Eigener Verlauf je Karte - erzeugt den Glow beim Hover. */
  glow: string;
  underline: string;
  /** Leicht unterschiedliche Dauern, damit das Raster nicht mechanisch wirkt. */
  duration: string;
};

const FEATURES: Feature[] = [
  {
    title: "Sehen, wer da ist",
    body: "Der Grundriss zeigt für jeden Tag, welche Plätze frei sind und wer im Büro sitzt.",
    icon: <PlanIcon />,
    glow: "from-sky-500/25 via-cyan-400/10 to-transparent",
    underline: "from-sky-500 to-cyan-400",
    duration: "duration-300",
  },
  {
    title: "In zwei Klicks gebucht",
    body: "Platz anklicken, optional einen Hinweis für Kolleg:innen hinterlassen, fertig.",
    icon: <ClickIcon />,
    glow: "from-violet-500/25 via-fuchsia-400/10 to-transparent",
    underline: "from-violet-500 to-fuchsia-400",
    duration: "duration-500",
  },
  {
    title: "Ganze Wochen planen",
    body: "Tages-, Wochen- und Monatsansicht oder ein frei gewählter Zeitraum.",
    icon: <CalendarRangeIcon />,
    glow: "from-emerald-500/25 via-teal-400/10 to-transparent",
    underline: "from-emerald-500 to-teal-400",
    duration: "duration-700",
  },
];

export default function FeatureCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {FEATURES.map((f) => (
        <article
          key={f.title}
          // Benannte Gruppe: jede Karte reagiert unabhaengig auf ihren eigenen Hover.
          className="group/card relative overflow-hidden rounded-xl2 border border-line bg-surface p-4
                     transition-colors duration-300 hover:border-accent/40"
        >
          {/* Verlauf-Glow, blendet weich ein */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-px rounded-xl2 bg-gradient-to-br ${f.glow}
                        opacity-0 transition-opacity ${f.duration} group-hover/card:opacity-100`}
          />
          <div className="relative">
            <span
              className={`inline-flex text-accent transition-transform ${f.duration} ease-out
                          group-hover/card:scale-110 group-hover/card:-rotate-6`}
            >
              {f.icon}
            </span>
            <h3
              className={`mt-3 text-sm font-semibold tracking-tight transition-transform ${f.duration}
                          group-hover/card:-translate-y-0.5`}
            >
              {f.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{f.body}</p>
          </div>
          {/* Unterstrich waechst von links nach rechts */}
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-gradient-to-r
                        ${f.underline} transition-transform ${f.duration} ease-out
                        group-hover/card:scale-x-100`}
          />
        </article>
      ))}
    </div>
  );
}

function PlanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 10h7V3M14 21v-7h7" />
    </svg>
  );
}
function ClickIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4V2M4 9H2M6.3 6.3 4.9 4.9M6.3 13.7l-1.4 1.4M13.7 6.3l1.4-1.4" />
      <path d="M10 10l10 4-4.5 1.5L14 20z" />
    </svg>
  );
}
function CalendarRangeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 15h8" />
    </svg>
  );
}
