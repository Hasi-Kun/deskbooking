"use client";

type Tip = { title: string; body: string; icon: React.ReactNode; glow: string; underline: string; duration: string };

const TIPS: Tip[] = [
  {
    title: "Elemente platzieren",
    body: "Tisch, Tür, Pflanze & Co. aus der Leiste links auf die Fläche ziehen.",
    icon: <DragIcon />,
    glow: "from-emerald-500/25 via-teal-400/10 to-transparent",
    underline: "from-emerald-500 to-teal-400",
    duration: "duration-300",
  },
  {
    title: "Wände zeichnen",
    body: "Werkzeug \u201eWand zeichnen\u201c aktivieren und ziehen. Shift rastet auf 15\u00b0.",
    icon: <WallIcon />,
    glow: "from-sky-500/25 via-cyan-400/10 to-transparent",
    underline: "from-sky-500 to-cyan-400",
    duration: "duration-500",
  },
  {
    title: "Eigenschaften",
    body: "Rechtsklick auf ein Element öffnet das Menü. Entf löscht die Auswahl.",
    icon: <PointerIcon />,
    glow: "from-violet-500/25 via-fuchsia-400/10 to-transparent",
    underline: "from-violet-500 to-fuchsia-400",
    duration: "duration-700",
  },
  {
    title: "Speichern",
    body: "Änderungen sammeln sich und werden mit Strg + S übernommen.",
    icon: <SaveIcon />,
    glow: "from-amber-500/25 via-orange-400/10 to-transparent",
    underline: "from-amber-500 to-orange-400",
    duration: "duration-500",
  },
  {
    title: "Feinjustieren",
    body: "Pfeiltasten schieben das ausgewählte Element (Shift = größerer Schritt), Mausrad dreht es.",
    icon: <NudgeIcon />,
    glow: "from-rose-500/25 via-pink-400/10 to-transparent",
    underline: "from-rose-500 to-pink-400",
    duration: "duration-500",
  },
];

/** Kurzanleitung unterhalb der Zeichenfläche - gleiche Gestaltung wie die
 *  Hinweiskarten im Grundriss. */
export default function EditorGuide() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TIPS.map((t) => (
        <article
          key={t.title}
          className="group/card relative overflow-hidden rounded-xl2 border border-line bg-surface p-3.5
                     transition-colors duration-300 hover:border-accent/40"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-px rounded-xl2 bg-gradient-to-br ${t.glow}
                        opacity-0 transition-opacity ${t.duration} group-hover/card:opacity-100`}
          />
          <div className="relative">
            <span className={`inline-flex text-accent transition-transform ${t.duration} ease-out
                              group-hover/card:scale-110 group-hover/card:-rotate-6`}>
              {t.icon}
            </span>
            <h3 className={`mt-2.5 text-xs font-semibold tracking-tight transition-transform ${t.duration}
                            group-hover/card:-translate-y-0.5`}>
              {t.title}
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{t.body}</p>
          </div>
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-gradient-to-r
                        ${t.underline} transition-transform ${t.duration} ease-out group-hover/card:scale-x-100`}
          />
        </article>
      ))}
    </div>
  );
}

const svg = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};

function DragIcon() {
  return (<svg {...svg}><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>);
}
function WallIcon() {
  return (<svg {...svg}><path d="M3 7h18M3 12h18M3 17h18M8 7v5M16 12v5" /></svg>);
}
function PointerIcon() {
  return (<svg {...svg}><path d="M5 3l6 16 2.5-6.5L20 10z" /></svg>);
}
function SaveIcon() {
  return (<svg {...svg}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>);
}
function NudgeIcon() {
  return (<svg {...svg}><path d="M12 19V5M5 12l7-7 7 7" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></svg>);
}
