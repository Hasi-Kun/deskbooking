"use client";

export type BadgeTone = "free" | "busy" | "away" | "fixed" | "none";

const BADGE: Record<Exclude<BadgeTone, "none">, { cls: string; title: string }> = {
  free:  { cls: "bg-free",        title: "frei" },
  busy:  { cls: "bg-occupied",    title: "belegt" },
  away:  { cls: "bg-amber-400",   title: "nur zeitweise" },
  fixed: { cls: "bg-[--accent]",  title: "fest zugewiesen" },
};

/** Farbe aus dem Namen ableiten - dieselbe Person bekommt immer dieselbe. */
function hueFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  badge?: BadgeTone;
  /** Online-Status im Chat (grün/grau, wie bei Discord) - unabhängig vom
   *  Buchungs-"badge" oben, da beide nie gleichzeitig gebraucht werden. */
  online?: boolean;
  /** Für den Hover-Titel des Online-Punkts, wenn "online" false ist - zeigt
   *  z.B. "Zuletzt online vor 12 Min." statt nur "Offline". */
  lastSeenAt?: string | null;
  /** Ring in Hintergrundfarbe - für überlappende Gruppen. */
  ring?: boolean;
  title?: string;
};

function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "Offline";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Zuletzt online: gerade eben";
  if (diffMin < 60) return `Zuletzt online: vor ${diffMin} Min.`;
  if (diffMin < 60 * 24) return `Zuletzt online: vor ${Math.round(diffMin / 60)} Std.`;
  return `Zuletzt online: vor ${Math.round(diffMin / (60 * 24))} Tagen`;
}

/**
 * Rundes Kürzel-Bild. Ohne Profilbild wird ein farbiges Monogramm erzeugt,
 * dessen Farbton aus dem Namen abgeleitet ist. Der Statuspunkt sitzt unten
 * rechts.
 */
export default function Avatar({ name, src, size = 32, badge = "none", online, lastSeenAt, ring, title }: Props) {
  const hue = hueFor(name);
  const dot = Math.max(8, Math.round(size * 0.3));

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
      title={title ?? name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src} alt={name}
          className={["h-full w-full rounded-full object-cover", ring ? "ring-2 ring-surface" : ""].join(" ")}
        />
      ) : (
        <span
          aria-hidden="true"
          className={[
            "grid h-full w-full place-items-center rounded-full font-semibold text-white",
            ring ? "ring-2 ring-surface" : "",
          ].join(" ")}
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 55% 32%))`,
            fontSize: Math.max(9, Math.round(size * 0.36)),
          }}
        >
          {initials(name)}
        </span>
      )}
      <span className="sr-only">{name}</span>

      {online !== undefined ? (
        <span
          title={online ? "Online" : lastSeenLabel(lastSeenAt)}
          aria-label={online ? "Online" : lastSeenLabel(lastSeenAt)}
          className={[
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface",
            online ? "bg-free" : "bg-muted/50",
          ].join(" ")}
          style={{ width: dot, height: dot }}
        />
      ) : badge !== "none" && (
        <span
          title={BADGE[badge].title}
          className={[
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface",
            BADGE[badge].cls,
          ].join(" ")}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

/** Überlappende Reihe mit Zähler - z. B. Teilnehmer eines Besprechungstisches. */
export function AvatarGroup({
  people, max = 3, size = 28,
}: { people: { name: string; src?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} src={p.src} size={size} ring />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{ marginLeft: -size * 0.3, width: size, height: size }}
          className="grid place-items-center rounded-full bg-raised text-[10px] font-semibold
                     text-muted ring-2 ring-surface"
          title={people.slice(max).map((p) => p.name).join(", ")}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
