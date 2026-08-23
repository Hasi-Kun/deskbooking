"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Booking, Desk, Floor, User, naturalCompare } from "@/lib/api";
import AppShell from "../components/AppShell";
import { useAppData } from "../components/AppDataProvider";
import { GlowCard, CardHeader, CardBody, StatPair } from "../components/ui/GlowCard";
import Button from "../components/ui/Button";
import { ListSkeleton } from "../components/ui/Skeleton";
import { toISO, fromISO, DatePicker } from "../components/ui/DatePicker";
import DayResourceView from "../components/DayResourceView";

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/** Einen Kalendertag in Richtung dir (+1/-1) weiterbewegen und dabei
 *  Wochenenden überspringen - genau wie die Tagesansicht das über ihre
 *  vorgefilterte "days"-Liste bereits tut. Vorher inkrementierte der
 *  ‹ ›-Stepper in der Matrix-Ansicht rohe Kalendertage und landete dabei
 *  auch auf Samstag/Sonntag, während die Tagesansicht sie korrekt ausließ. */
const stepWorkday = (iso: string, dir: 1 | -1) => {
  let cur = iso;
  do {
    cur = addDays(cur, dir);
  } while ([0, 6].includes(fromISO(cur).getDay()));
  return cur;
};

type Span = 14 | 30 | 60;

export default function OverviewPage() {
  const router = useRouter();
  const { data, ensure } = useAppData();
  const [user, setUser] = useState<User | null>(data.user);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [span, setSpan] = useState<Span>(14);
  const [start, setStart] = useState(toISO(new Date()));
  const [view, setView] = useState<"matrix" | "day">("matrix");
  const [dayFocus, setDayFocus] = useState(toISO(new Date()));
  const [loading, setLoading] = useState(true);

  // Nur Werktage (Mo-Fr). Es wird so lange weitergezaehlt, bis "span" viele
  // Arbeitstage zusammengekommen sind - Wochenenden zaehlen nicht mit.
  const days = useMemo(() => {
    const out: string[] = [];
    let cursor = start;
    let guard = 0;
    while (out.length < span && guard++ < span * 3 + 14) {
      const wd = fromISO(cursor).getDay();
      if (wd !== 0 && wd !== 6) out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [start, span]);

  const load = useCallback(async (fId: string, from: string, to: string) => {
    const [d, b] = await Promise.all([
      api<Desk[]>(`/api/desks?floor_id=${fId}`),
      api<Booking[]>(`/api/bookings?date_from=${from}&date_to=${to}`),
    ]);
    setDesks(d);
    setBookings(b);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cache = await ensure({ user: true, floors: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        setUser(cache.user);
        setFloors(cache.floors);
        const first = cache.floors[0]?.id ?? null;
        setFloorId(first);
        if (first) await load(first, days[0], days[days.length - 1]);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !floorId) return;
    load(floorId, days[0], days[days.length - 1]).catch(() => {});
  }, [user, floorId, days, load]);

  // Tagesansicht: an den geladenen Zeitraum klemmen, statt einen eigenen
  // Netzwerk-Request zu feuern - "days" deckt den Bereich schon ab.
  useEffect(() => {
    if (days.length && !days.includes(dayFocus)) setDayFocus(days[0]);
  }, [days, dayFocus]);

  const dayIndex = days.indexOf(dayFocus);

  // Buchungen nach Platz + Tag, für schnellen Zugriff je Zelle
  const byDeskDay = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((b) => map.set(`${b.desk_id}|${b.booking_date}`, b));
    return map;
  }, [bookings]);

  const active = useMemo(
    () => desks.filter((d) => d.is_active).sort((a, b) => naturalCompare(a.name, b.name)),
    [desks]
  );
  const bookable = useMemo(() => active.filter((d) => !d.fixed_user_id), [active]);

  // Kennzahlen über den Zeitraum
  const stats = useMemo(() => {
    const workdays = days.filter((d) => {
      const wd = fromISO(d).getDay();  // defensiv: days enthaelt bereits nur Mo-Fr
      return wd !== 0 && wd !== 6;
    });
    const capacity = bookable.length * workdays.length;
    const used = bookings.filter((b) => {
      const wd = fromISO(b.booking_date).getDay();
      return wd !== 0 && wd !== 6;
    }).length;
    const rate = capacity ? Math.round((used / capacity) * 100) : 0;
    // Meistgenutzter Platz
    const counts = new Map<string, number>();
    bookings.forEach((b) => counts.set(b.desk_id, (counts.get(b.desk_id) ?? 0) + 1));
    let topId = "";
    let topN = 0;
    counts.forEach((n, id) => { if (n > topN) { topN = n; topId = id; } });
    return {
      rate, used, capacity,
      top: desks.find((d) => d.id === topId)?.name ?? "–",
      topN,
    };
  }, [days, bookable, bookings, desks]);

  const todayISO = toISO(new Date());

  if (loading) {
    return <AppShell user={user}><ListSkeleton rows={6} /></AppShell>;
  }

  return (
    <AppShell user={user}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight glow-text">Belegungsübersicht</h1>
            <p className="mt-0.5 text-sm text-muted">
              Alle Plätze über {span} Tage – eine Zeile pro Tisch
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {floors.length > 1 && floors.map((f) => (
              <Button key={f.id} size="sm" variant={f.id === floorId ? "primary" : "secondary"}
                      onClick={() => setFloorId(f.id)}>
                {f.name}
              </Button>
            ))}
            <div className="inline-flex rounded-lg border border-line">
              {([
                ["matrix", "Matrix"], ["day", "Tag"],
              ] as [typeof view, string][]).map(([v, label], i) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={[
                    "px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
                    i === 0 ? "rounded-l-lg" : "rounded-r-lg",
                    view === v ? "text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
                  ].join(" ")}
                  style={view === v ? { background: "var(--accent)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Zeitfenster-Presets IMMER sichtbar (nicht nur in Matrix) -
                gleiche Breite in beiden Ansichten verhindert das Springen der
                Steuerleiste. In der Tagesansicht sind sie aber deaktiviert:
                dort bestimmt die "‹ Datum ›"-Navigation direkt daneben den
                Fokustag, ein Wechsel des Fensters ergibt dort keinen Sinn. */}
            <div className={["inline-flex rounded-lg border border-line", view === "day" ? "opacity-40" : ""].join(" ")}>
              {([14, 30, 60] as Span[]).map((s, i) => (
                <button
                  key={s}
                  onClick={() => view === "matrix" && setSpan(s)}
                  disabled={view === "day"}
                  className={[
                    "px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
                    i === 0 ? "rounded-l-lg" : i === 2 ? "rounded-r-lg" : "border-x border-line",
                    view === "day" ? "cursor-not-allowed text-muted"
                      : span === s ? "text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
                  ].join(" ")}
                  style={view === "matrix" && span === s ? { background: "var(--accent)" } : undefined}
                >
                  {s}T
                </button>
              ))}
            </div>
            {/* Ein EINZIGES ‹ Datum › Element für beide Ansichten (nicht mehr
                zwei unterschiedlich breite Varianten je nach view) - das war
                die eigentliche Ursache der leichten Verschiebung: die
                Steuerleiste ist rechtsbündig (justify-between), jede
                Breitenänderung dieses letzten Elements verschob dadurch den
                ganzen Block nach links/rechts. Jetzt immer exakt dieselben
                drei Kinder, nur die Bindung (Tag-Fokus vs. Fensterstart)
                wechselt im Hintergrund. */}
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-line py-1 pl-1 pr-2">
              <button
                onClick={() => {
                  if (view === "day") { if (dayIndex > 0) setDayFocus(days[dayIndex - 1]); }
                  else setStart(stepWorkday(start, -1));
                }}
                disabled={view === "day" && dayIndex <= 0}
                aria-label="Vorheriger Tag"
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors
                           hover:bg-raised hover:text-ink focus-ring disabled:opacity-30"
              >
                ‹
              </button>
              <DatePicker
                value={view === "day" ? dayFocus : start}
                onChange={(iso) => {
                  if (view === "day") { if (days.includes(iso)) setDayFocus(iso); }
                  else {
                    // Direkte Kalenderauswahl eines Wochenendtags auf den
                    // nächsten Werktag ziehen - dieselbe Regel wie beim
                    // ‹ ›-Blättern (siehe stepWorkday).
                    const wd = fromISO(iso).getDay();
                    setStart(wd === 0 || wd === 6 ? stepWorkday(iso, 1) : iso);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (view === "day") { if (dayIndex >= 0 && dayIndex < days.length - 1) setDayFocus(days[dayIndex + 1]); }
                  else setStart(stepWorkday(start, 1));
                }}
                disabled={view === "day" && (dayIndex < 0 || dayIndex >= days.length - 1)}
                aria-label="Nächster Tag"
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors
                           hover:bg-raised hover:text-ink focus-ring disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {view === "day" && (
          <DayResourceView day={dayFocus} desks={desks} bookings={bookings} currentUserId={user?.id} />
        )}

        {view === "matrix" && <>
        {/* Kennzahlen im Karten-Stil */}
        <GlowCard>
          <CardHeader icon={<ChartIcon />} title="Auslastung im Zeitraum"
                      subtitle={`${days[0]} bis ${days[days.length - 1]} · Montag bis Freitag`} />
          <CardBody>
            <StatPair
              left={{
                label: "Belegung", value: `${stats.rate}%`,
                hint: `${stats.used} von ${stats.capacity} Platztagen`,
                tone: stats.rate > 80 ? "danger" : "accent",
              }}
              right={{
                label: "Meistgenutzt", value: stats.top,
                hint: stats.topN ? `${stats.topN} Buchungen` : "keine Buchungen",
                tone: "muted",
              }}
            />
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full gradient-accent transition-all duration-500"
                   style={{ width: `${stats.rate}%` }} />
            </div>
          </CardBody>
        </GlowCard>

        {/* Zeitleiste: Zeilen = Tische, Spalten = Tage */}
        <div className="overflow-x-auto thin-scroll rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-muted">
                  Platz
                </th>
                {days.map((d) => {
                  const dt = fromISO(d);
                  const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <th key={d}
                        className={[
                          "min-w-[26px] px-0.5 py-2 text-center font-medium",
                          weekend ? "text-muted/40" : "text-muted",
                          d === todayISO ? "text-accent" : "",
                        ].join(" ")}>
                      <span className="block text-[9px] leading-none">
                        {dt.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}
                      </span>
                      <span className="block text-[10px] leading-tight tabular-nums">{dt.getDate()}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {active.map((desk) => (
                <tr key={desk.id} className="group/row border-t border-line">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 transition-colors
                                 group-hover/row:bg-raised">
                    <span className="text-[11px] font-semibold tabular-nums">{desk.name}</span>
                    {desk.fixed_user_id && (
                      <span className="ml-1.5 text-[9px] text-muted">fest</span>
                    )}
                    {desk.zone && !desk.fixed_user_id && (
                      <span className="ml-1.5 text-[9px] text-muted">{desk.zone}</span>
                    )}
                  </td>
                  {days.map((d) => {
                    const dt = fromISO(d);
                    const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                    const b = byDeskDay.get(`${desk.id}|${d}`);
                    const fixed = !!desk.fixed_user_id;
                    const mine = b?.user_id === user?.id;

                    let cls = "bg-transparent";
                    let title = `${desk.name} · ${d} — frei`;
                    if (fixed) {
                      cls = "bg-occupied/25";
                      title = `${desk.name} · fest an ${desk.fixed_user_name}`;
                    } else if (b) {
                      cls = mine ? "" : "bg-occupied/60";
                      title = `${desk.name} · ${d} — ${b.user_name}${b.comment ? ` · ${b.comment}` : ""}`;
                    }

                    return (
                      <td key={d} className="px-0.5 py-1.5">
                        <span
                          title={title}
                          className={[
                            "block h-4 rounded-[3px] transition-colors",
                            weekend && !b && !fixed ? "bg-line/40" : cls,
                            !b && !fixed && !weekend ? "bg-line/70" : "",
                          ].join(" ")}
                          style={mine ? { background: "var(--accent)" } : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="px-3 py-6 text-center text-sm text-muted">
                    Für diese Ebene sind keine Plätze angelegt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legende */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <Legend className="bg-line/70" label="Frei" />
          <Legend style={{ background: "var(--accent)" }} label="Deine Buchung" />
          <Legend className="bg-occupied/60" label="Belegt" />
          <Legend className="bg-occupied/25" label="Fest vergeben" />
          <Legend className="bg-line/40" label="Wochenende" />
        </div>
        </>}
      </div>
    </AppShell>
  );
}

function Legend({ className = "", style, label }: { className?: string; style?: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={`h-3 w-5 rounded-[3px] ${className}`} style={style} />
      {label}
    </span>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" />
      <path d="M15 5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" />
      <path d="M4 20h14" />
    </svg>
  );
}
