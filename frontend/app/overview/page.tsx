"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Booking, Desk, Floor, User } from "@/lib/api";
import AppShell from "../components/AppShell";
import { GlowCard, CardHeader, CardBody, StatPair } from "../components/ui/GlowCard";
import Button from "../components/ui/Button";
import { ListSkeleton } from "../components/ui/Skeleton";
import { toISO, fromISO } from "../components/ui/DatePicker";

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

type Span = 14 | 30 | 60;

export default function OverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [span, setSpan] = useState<Span>(14);
  const [start, setStart] = useState(toISO(new Date()));
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
        const u = await api<User>("/api/auth/me");
        setUser(u);
        const f = await api<Floor[]>("/api/floors");
        setFloors(f);
        const first = f[0]?.id ?? null;
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

  // Buchungen nach Platz + Tag, für schnellen Zugriff je Zelle
  const byDeskDay = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((b) => map.set(`${b.desk_id}|${b.booking_date}`, b));
    return map;
  }, [bookings]);

  const active = useMemo(() => desks.filter((d) => d.is_active), [desks]);
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
    return <AppShell user={null}><ListSkeleton rows={6} /></AppShell>;
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
              {([14, 30, 60] as Span[]).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSpan(s)}
                  className={[
                    "px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring",
                    i === 0 ? "rounded-l-lg" : i === 2 ? "rounded-r-lg" : "border-x border-line",
                    span === s ? "text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
                  ].join(" ")}
                  style={span === s ? { background: "var(--accent)" } : undefined}
                >
                  {s}T
                </button>
              ))}
            </div>
            <input
              type="date" value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs focus-ring"
            />
          </div>
        </div>

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
                    <span className="font-mono text-[11px] font-semibold">{desk.name}</span>
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
