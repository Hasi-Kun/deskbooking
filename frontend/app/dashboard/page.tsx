"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, Absence, Booking, BookingSlot, Desk, Floor, SceneObject, User } from "@/lib/api";
import AppShell from "../components/AppShell";
import { useAppData } from "../components/AppDataProvider";
import FloorCanvas from "../components/FloorCanvas";
import BookingPopover from "../components/BookingPopover";
import DayStrip, { DayLoad } from "../components/DayStrip";
import FeatureCards from "../components/FeatureCards";
import Button from "../components/ui/Button";
import { FloorSkeleton } from "../components/ui/Skeleton";
import PeriodNavigator, { RangeMode } from "../components/ui/PeriodNavigator";
import { toISO, fromISO, formatLong } from "../components/ui/DatePicker";
import ChatDock from "../components/ChatDock";

function addDays(iso: string, days: number) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}
function startOfWeek(iso: string) {
  const d = fromISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Montag
  return toISO(d);
}
function startOfMonth(iso: string) {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfMonth(iso: string) {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export default function Dashboard() {
  const router = useRouter();
  const { data, ensure } = useAppData();
  // Direkt aus dem Cache initialisieren statt mit null zu starten: war die
  // Seite in dieser Sitzung schon einmal geladen, steht der Nutzername sofort
  // bereit - ohne das kurze Verschwinden/Wiedererscheinen beim Seitenwechsel,
  // das entsteht, wenn jede Seite ihren State bei null neu beginnt und erst
  // nach einem Effekt-Durchlauf wieder auffüllt.
  const [user, setUser] = useState<User | null>(data.user);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mine, setMine] = useState<Booking[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);

  const [rangeMode, setRangeMode] = useState<RangeMode>("day");
  const [anchor, setAnchor] = useState(toISO(new Date()));
  const [custom, setCustom] = useState({ from: toISO(new Date()), to: addDays(toISO(new Date()), 6) });
  // Welcher Tag im Zeitraum wird im Grundriss dargestellt
  const [focusDay, setFocusDay] = useState(toISO(new Date()));

  const [popover, setPopover] = useState<{ desk: Desk; bookings: Booking[]; rect: DOMRect } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Zeitraum aus Modus + Ankerdatum ableiten
  const period = useMemo(() => {
    if (rangeMode === "day") return { from: anchor, to: anchor };
    if (rangeMode === "week") {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    if (rangeMode === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    return custom;
  }, [rangeMode, anchor, custom]);

  // Alle Werktage des Zeitraums (fuer die Tagesleiste) - Wochenenden werden
  // ausgelassen, genau wie in der Belegungsübersicht. Bleibt dabei nichts
  // übrig (z.B. eine einzelne Tagesansicht, die theoretisch auf einem
  // Wochenende landet), lieber den Tag trotzdem zeigen als eine leere Leiste.
  const days = useMemo(() => {
    const out: string[] = [];
    let cur = period.from;
    let guard = 0;
    while (cur <= period.to && guard++ < 200) {
      const wd = fromISO(cur).getDay();
      if (wd !== 0 && wd !== 6) out.push(cur);
      cur = addDays(cur, 1);
    }
    return out.length ? out : [period.from];
  }, [period]);

  useEffect(() => {
    // Fokustag immer innerhalb der (werktags-gefilterten) Tagesliste halten
    if (!days.includes(focusDay)) setFocusDay(days[0]);
  }, [days, focusDay]);

  const loadFloorData = useCallback(async (fId: string, from: string, to: string) => {
    const [desksRes, objectsRes, bookingsRes, mineRes, absencesRes] = await Promise.all([
      api<Desk[]>(`/api/desks?floor_id=${fId}`),
      api<SceneObject[]>(`/api/scene?floor_id=${fId}`),
      api<Booking[]>(`/api/bookings?date_from=${from}&date_to=${to}`),
      api<Booking[]>("/api/bookings/mine"),
      api<Absence[]>(`/api/absences?date_from=${from}&date_to=${to}`),
    ]);
    setDesks(desksRes);
    setObjects(objectsRes);
    setBookings(bookingsRes);
    setMine(mineRes);
    setAbsences(absencesRes);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Stammdaten kommen aus dem gemeinsamen Cache - beim Zurückwechseln
        // von Layout/Nutzer werden sie nicht erneut geladen.
        const cache = await ensure({ user: true, floors: true });
        if (!cache.user) throw new Error("nicht angemeldet");
        setUser(cache.user);
        setFloors(cache.floors);
        const first = cache.floors[0]?.id ?? null;
        setFloorId(first);
        if (first) await loadFloorData(first, period.from, period.to);
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
    setRefreshing(true);
    loadFloorData(floorId, period.from, period.to)
      .catch(() => setError("Daten konnten nicht geladen werden"))
      .finally(() => setRefreshing(false));
  }, [user, floorId, period.from, period.to, loadFloorData]);

  async function reload() {
    if (floorId) await loadFloorData(floorId, period.from, period.to);
  }

  async function handleConfirm({ comment, slot, attendeeIds, range, startTime, endTime }: {
    comment: string;
    slot: BookingSlot;
    attendeeIds: string[];
    range?: { from: string; to: string; skipWeekends: boolean };
    startTime?: string;
    endTime?: string;
  }) {
    if (!popover) return;
    if (range) {
      const res = await api<{ created: string[]; skipped: string[] }>("/api/bookings/range", {
        method: "POST",
        body: JSON.stringify({
          desk_id: popover.desk.id, date_from: range.from, date_to: range.to,
          slot, comment, attendee_ids: attendeeIds, skip_weekends: range.skipWeekends,
        }),
      });
      if (res.created.length === 0) {
        throw { message: "Keiner der gewählten Tage war buchbar" } as ApiError;
      }
      if (res.skipped.length) {
        setError(`${res.created.length} Tage gebucht, ${res.skipped.length} bereits belegt und übersprungen.`);
      }
    } else {
      await api<Booking>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          desk_id: popover.desk.id, booking_date: focusDay, slot, comment, attendee_ids: attendeeIds,
          start_time: startTime, end_time: endTime,
        }),
      });
    }
    await reload();
  }

  async function handleCancel(booking: Booking) {
    await api(`/api/bookings/${booking.id}`, { method: "DELETE" });
    await reload();
  }

  // Auslastung je Tag fuer die Ampel-Leiste
  const dayLoads: DayLoad[] = useMemo(() => {
    const bookable = desks.filter((d) => d.is_active && !d.fixed_user_id);
    return days.map((d) => {
      const taken = bookings.filter((b) => b.booking_date === d).length;
      return {
        date: d,
        free: Math.max(0, bookable.length - taken),
        total: bookable.length,
        mine: mine.some((b) => b.booking_date === d),
      };
    });
  }, [days, bookings, desks, mine]);

  // Ein Platz kann pro Tag zwei Halbtags-Buchungen tragen - daher eine Liste.
  const bookingByDesk = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings
      .filter((b) => b.booking_date === focusDay)
      .forEach((b) => {
        const list = map.get(b.desk_id) ?? [];
        list.push(b);
        map.set(b.desk_id, list);
      });
    return map;
  }, [bookings, focusDay]);

  // Nutzer, die am Fokustag im Urlaub sind - Grundlage dafür, ob ein fester
  // Platz heute als frei gilt.
  const absentUserIds = useMemo(() => {
    const set = new Set<string>();
    absences
      .filter((a) => a.date_from <= focusDay && a.date_to >= focusDay)
      .forEach((a) => set.add(a.user_id));
    return set;
  }, [absences, focusDay]);

  // Ein fest zugewiesener Platz gilt am Fokustag als frei, wenn die Person
  // entweder im Urlaub ist ODER der Tag laut Desk.fixed_days gar kein
  // "Büro-Tag" für sie ist (z.B. ihr Homeoffice-Tag Mi/Fr).
  const focusWeekday = (fromISO(focusDay).getDay() + 6) % 7; // Montag=0...Sonntag=6
  const absentFixedDeskIds = useMemo(() => {
    const set = new Set<string>();
    desks.forEach((d) => {
      if (!d.fixed_user_id) return;
      const isOfficeDay = d.fixed_days.includes(focusWeekday);
      if (!isOfficeDay || absentUserIds.has(d.fixed_user_id)) set.add(d.id);
    });
    return set;
  }, [desks, absentUserIds, focusWeekday]);

  /** Ein normaler Einzelplatz gilt als voll, wenn ganztags gebucht ist oder
   *  beide Halbtage weg sind. Konferenztische zählen hier immer als "frei" -
   *  ihre Belegung ist zeitfensterbasiert (mehrere Meetings pro Tag möglich),
   *  ein einzelnes Tages-Ja/Nein passt darauf nicht mehr. */
  const isFullyBooked = (desk: Desk) => {
    if (desk.capacity > 1) return false;
    const list = bookingByDesk.get(desk.id) ?? [];
    return list.some((b) => b.slot === "full") || list.length >= 2;
  };
  const currentFloor = floors.find((f) => f.id === floorId);
  const myBookingToday = mine.find((b) => b.booking_date === focusDay);

  const activeDesks = useMemo(() => desks.filter((d) => d.is_active), [desks]);
  const freeCount = activeDesks.filter(
    (d) => (!d.fixed_user_id || absentFixedDeskIds.has(d.id)) && !isFullyBooked(d)
  ).length;

  if (loading) {
    return (
      <AppShell user={user}>
        <FloorSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="space-y-5">
        {/* Kopfbereich mit Zeitraum-Steuerung */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight capitalize glow-text">{formatLong(focusDay)}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {myBookingToday ? (
                <>Dein Platz: <span className="tabular-nums">{myBookingToday.desk_name}</span></>
              ) : (
                <>{freeCount} von {activeDesks.length} Plätzen frei</>
              )}
            </p>
          </div>
          <PeriodNavigator
            mode={rangeMode}
            onModeChange={setRangeMode}
            anchor={anchor}
            onAnchorChange={setAnchor}
            custom={custom}
            onCustomChange={(from, to) => setCustom({ from, to })}
            from={period.from}
            to={period.to}
          />
        </div>

        <DayStrip days={dayLoads} focus={focusDay} onFocus={setFocusDay} />

        {floors.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {floors.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={f.id === floorId ? "primary" : "secondary"}
                onClick={() => setFloorId(f.id)}
              >
                {f.name}
              </Button>
            ))}
          </div>
        )}

        {error && (
          <div role="alert"
               className="flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Meldung schließen" className="focus-ring rounded">✕</button>
          </div>
        )}

        {/* Legende */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-free" />Frei</span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />Deine Buchung
          </span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-occupied" />Belegt</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-dashed border-line" />Fest vergeben</span>
        </div>

        {refreshing && !currentFloor ? (
          <FloorSkeleton />
        ) : currentFloor && user ? (
          <div className={refreshing ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <FloorCanvas
              mode="view"
              floor={currentFloor}
              desks={desks}
              objects={objects}
              bookingByDesk={bookingByDesk}
              currentUserId={user.id}
              absentFixedDeskIds={absentFixedDeskIds}
              onDeskClick={(desk, list, rect) => setPopover({ desk, bookings: list, rect })}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">
            Noch kein Büro-Layout angelegt.{" "}
            {user?.role === "admin" && <a href="/admin/layout" className="underline">Jetzt anlegen</a>}
          </p>
        )}

        {/* Eigene kommende Buchungen */}
        {mine.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Deine kommenden Buchungen
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {mine.slice(0, 6).map((b) => (
                <div key={b.id}
                     className="group/booking rounded-lg border border-line bg-surface p-3 transition-all
                                duration-200 hover:border-accent/40 hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium tabular-nums">{b.desk_name}</span>
                    <span className="text-xs text-muted">{formatLong(b.booking_date)}</span>
                  </div>
                  {b.comment && <p className="mt-1 truncate text-xs text-muted">{b.comment}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <FeatureCards />
      </div>

      <BookingPopover
        anchor={popover?.rect ?? null}
        desk={popover?.desk ?? null}
        bookings={popover?.bookings ?? []}
        date={focusDay}
        currentUserId={user?.id ?? ""}
        onClose={() => setPopover(null)}
        onBook={handleConfirm}
        onCancel={handleCancel}
        temporarilyFree={!!popover?.desk && absentFixedDeskIds.has(popover.desk.id)}
      />
      {user && <ChatDock currentUser={user} />}
    </AppShell>
  );
}
