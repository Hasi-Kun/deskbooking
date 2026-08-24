"use client";
import { useEffect, useState } from "react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, Desk, Booking, BookingSlot } from "@/lib/api";
import AnchoredPopover from "./ui/AnchoredPopover";
import { GlowCard, CardHeader, CardBody, CardFooter } from "./ui/GlowCard";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";
import Avatar, { AvatarGroup } from "./ui/Avatar";
import StyledName from "./StyledName";
import { formatLong, toISO, fromISO } from "./ui/DatePicker";
import { useBrand } from "./BrandProvider";
import WeekdayPicker from "./ui/WeekdayPicker";

type Props = {
  anchor: DOMRect | null;
  desk: Desk | null;
  bookings: Booking[];
  date: string;
  currentUserId: string;
  onClose: () => void;
  onBook: (args: {
    comment: string;
    slot: BookingSlot;
    attendeeIds: string[];
    range?: { from: string; to: string; skipWeekends: boolean; weekdays?: number[] };
    /** Nur für Konferenztische: Uhrzeitfenster statt Halbtags-Slot. */
    startTime?: string;
    endTime?: string;
  }) => Promise<void>;
  onCancel: (booking: Booking) => Promise<void>;
  /** Fester Platz, dessen Person heute im Urlaub ist - für diesen Tag ganz
   *  normal buchbar statt blockiert. */
  temporarilyFree?: boolean;
};

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const SLOT_LABEL: Record<BookingSlot, string> = {
  full: "Ganztags",
  morning: "Vormittag",
  afternoon: "Nachmittag",
};

export default function BookingPopover({
  anchor, desk, bookings, date, currentUserId, onClose, onBook, onCancel, temporarilyFree,
}: Props) {
  const router = useRouter();
  // Welche Zeitfenster sind an diesem Platz schon vergeben?
  const takenFull = bookings.some((b) => b.slot === "full");
  const takenMorning = takenFull || bookings.some((b) => b.slot === "morning");
  const takenAfternoon = takenFull || bookings.some((b) => b.slot === "afternoon");
  const ownBooking = bookings.find((b) => b.user_id === currentUserId) ?? null;
  const canBookAnything = !(takenMorning && takenAfternoon);
  const [comment, setComment] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [range, setRange] = useState({ from: date, to: addDays(date, 4) });
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([fromISO(date).getDay() === 0 ? 6 : fromISO(date).getDay() - 1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nur fuer Konferenztische (Kapazitaet > 1) relevant: zusaetzliche Teilnehmer
  const isMeetingTable = (desk?.capacity ?? 1) > 1;
  const { max_meeting_hours: maxMeetingHours } = useBrand();
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [directory, setDirectory] = useState<{ id: string; full_name: string }[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  // Konferenztisch: Uhrzeitfenster statt Halbtags-Slot.
  const [timeRange, setTimeRange] = useState({ start: "09:00", end: "10:00" });
  const timeBookings = [...bookings].sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const timeOverlaps = isMeetingTable && timeBookings.some(
    (b) => !!b.start_time && !!b.end_time && b.start_time < timeRange.end && b.end_time > timeRange.start
  );
  const timeDurationH = (() => {
    const [sh, sm] = timeRange.start.split(":").map(Number);
    const [eh, em] = timeRange.end.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  })();
  const timeTooLong = isMeetingTable && maxMeetingHours > 0 && timeDurationH > maxMeetingHours;

  const loadDirectory = useCallback(() => {
    if (directoryLoaded) return;
    api<{ id: string; full_name: string }[]>("/api/chat/directory")
      .then((rows) => { setDirectory(rows); setDirectoryLoaded(true); })
      .catch(() => {});
  }, [directoryLoaded]);

  useEffect(() => {
    setComment("");
    setMultiDay(false);
    setRange({ from: date, to: addDays(date, 4) });
    setError(null);
    setAttendeeIds([]);
    setShowPicker(false);
  }, [desk?.id, date]);

  const [slot, setSlot] = useState<BookingSlot>("full");

  useEffect(() => {
    // Sinnvolle Vorauswahl: ist ein Halbtag weg, den anderen vorschlagen.
    if (takenFull) return;
    if (takenMorning && !takenAfternoon) setSlot("afternoon");
    else if (takenAfternoon && !takenMorning) setSlot("morning");
    else setSlot("full");
  }, [takenFull, takenMorning, takenAfternoon, desk?.id, date]);

  if (!desk || !anchor) return null;

  const isFixed = !!desk.fixed_user_id && !temporarilyFree;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Aktion fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const slotOptions: { value: BookingSlot; disabled: boolean }[] = [
    { value: "full", disabled: takenMorning || takenAfternoon },
    { value: "morning", disabled: takenMorning },
    { value: "afternoon", disabled: takenAfternoon },
  ];

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} width={304}>
      <GlowCard>
        <CardHeader
          icon={<DeskGlyph />}
          title={desk.name}
          subtitle={[desk.zone || null, formatLong(date)].filter(Boolean).join(" · ")}
          action={
            <button onClick={onClose} aria-label="Schließen"
                    className="-mr-1 rounded-md px-1.5 text-muted transition-colors hover:text-ink focus-ring">
              ✕
            </button>
          }
        />

        <CardBody className="space-y-3.5">
          {isFixed && (
            <div className="flex items-center gap-2.5">
              <Avatar name={desk.fixed_user_name || "?"} size={34} badge="fixed" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <StyledName name={desk.fixed_user_name || ""}
                              style={desk.fixed_user_style} color={desk.fixed_user_style_color} />
                </p>
                <p className="text-xs text-muted">Fest zugewiesen · nicht buchbar</p>
              </div>
              {desk.fixed_user_id && desk.fixed_user_id !== currentUserId && (
                <ChatButton onClick={() => router.push(`/chat?with=${desk.fixed_user_id}`)} />
              )}
            </div>
          )}

          {!!desk.fixed_user_id && temporarilyFree && (
            <div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2">
              <Avatar name={desk.fixed_user_name || "?"} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  <StyledName name={desk.fixed_user_name || ""}
                              style={desk.fixed_user_style} color={desk.fixed_user_style_color} /> heute nicht im Büro
                </p>
                <p className="text-[11px] text-muted">Platz ist heute frei buchbar.</p>
              </div>
              {desk.fixed_user_id !== currentUserId && (
                <ChatButton onClick={() => router.push(`/chat?with=${desk.fixed_user_id}`)} />
              )}
            </div>
          )}

          {/* Wer sitzt hier schon? - Konferenztische: Liste der Zeitfenster
              statt einer einzelnen ganztags/halbtags-Buchung. */}
          {!isFixed && isMeetingTable && timeBookings.length > 0 && (
            <div className="space-y-2">
              {timeBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-2.5">
                  <Avatar name={b.user_name} size={30} badge={b.user_id === currentUserId ? "free" : "busy"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.user_id === currentUserId
                        ? "Du"
                        : <StyledName name={b.user_name} style={b.user_name_style} color={b.user_name_style_color} />}
                    </p>
                    <p className="text-xs tabular-nums text-muted">
                      {b.start_time ?? "?"}–{b.end_time ?? "?"} Uhr
                      {b.attendees.length > 0 && ` · +${b.attendees.length} ${b.attendees.length === 1 ? "Person" : "Personen"}`}
                    </p>
                  </div>
                  {b.attendees.length > 0 && (
                    <AvatarGroup people={b.attendees.map((a) => ({ name: a.full_name }))} max={3} size={20} />
                  )}
                  {b.user_id === currentUserId ? (
                    <Button size="sm" variant="danger" loading={busy}
                            onClick={() => run(() => onCancel(b))}>
                      Stornieren
                    </Button>
                  ) : (
                    <ChatButton onClick={() => router.push(`/chat?with=${b.user_id}`)} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Wer sitzt hier schon? (normale Plätze) */}
          {!isFixed && !isMeetingTable && bookings.length > 0 && (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center gap-2.5">
                  <Avatar
                    name={b.user_name}
                    size={34}
                    badge={b.user_id === currentUserId ? "free" : "busy"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {b.user_id === currentUserId
                        ? "Du"
                        : <StyledName name={b.user_name} style={b.user_name_style} color={b.user_name_style_color} />}
                    </p>
                    <p className="text-xs text-muted">
                      {SLOT_LABEL[b.slot]}
                      {b.attendees.length > 0 && ` · +${b.attendees.length} ${b.attendees.length === 1 ? "Person" : "Personen"}`}
                    </p>
                  </div>
                  {b.attendees.length > 0 && (
                    <AvatarGroup people={b.attendees.map((a) => ({ name: a.full_name }))} max={3} size={22} />
                  )}
                  {b.user_id === currentUserId ? (
                    <Button size="sm" variant="danger" loading={busy}
                            onClick={() => run(() => onCancel(b))}>
                      Stornieren
                    </Button>
                  ) : (
                    <ChatButton onClick={() => router.push(`/chat?with=${b.user_id}`)} />
                  )}
                </div>
              ))}
              {bookings.some((b) => b.comment) && (
                <p className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
                  {bookings.find((b) => b.comment)?.comment}
                </p>
              )}
            </div>
          )}

          {/* Buchen: Konferenztisch - Uhrzeitfenster, mehrere Meetings pro Tag möglich */}
          {!isFixed && isMeetingTable && (
            <div className="space-y-3.5 border-t border-line pt-3.5">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted">Uhrzeit</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Von</span>
                    <input
                      type="time" value={timeRange.start}
                      onChange={(e) => setTimeRange((r) => ({ ...r, start: e.target.value }))}
                      className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-sm tabular-nums focus-ring"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Bis</span>
                    <input
                      type="time" value={timeRange.end} min={timeRange.start}
                      onChange={(e) => setTimeRange((r) => ({ ...r, end: e.target.value }))}
                      className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-sm tabular-nums focus-ring"
                    />
                  </label>
                </div>
                {timeOverlaps && (
                  <p className="mt-1.5 text-[11px] text-danger">In diesem Zeitraum ist der Tisch schon belegt.</p>
                )}
                {timeTooLong && (
                  <p className="mt-1.5 text-[11px] text-danger">
                    Konferenztische sind auf maximal {maxMeetingHours} Stunden am Stück begrenzt.
                  </p>
                )}
                {!timeOverlaps && !timeTooLong && maxMeetingHours > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted">Maximal {maxMeetingHours} Stunden am Stück.</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-[11px] font-medium text-muted">Teilnehmer</p>
                  <span className="text-[10px] text-muted/70">
                    Du + {attendeeIds.length} / {desk.capacity} Plätze
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => { setShowPicker((v) => !v); loadDirectory(); }}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-raised
                             px-3 py-2 text-left text-sm transition-colors hover:border-accent/40 focus-ring"
                >
                  {attendeeIds.length === 0 ? (
                    <span className="text-muted">Kolleg:innen hinzufügen…</span>
                  ) : (
                    <AvatarGroup
                      people={attendeeIds
                        .map((id) => directory.find((p) => p.id === id))
                        .filter((p): p is { id: string; full_name: string } => !!p)
                        .map((p) => ({ name: p.full_name }))}
                      max={5} size={22}
                    />
                  )}
                  <span className="ml-auto text-xs text-muted">{showPicker ? "▲" : "▼"}</span>
                </button>

                {showPicker && (
                  <div className="mt-1.5 max-h-40 animate-fade-in overflow-y-auto rounded-lg border
                                  border-line bg-raised p-1 thin-scroll">
                    {directory.length === 0 && (
                      <p className="px-2 py-2 text-xs text-muted">Lade Kolleg:innen…</p>
                    )}
                    {directory.map((p) => {
                      const checked = attendeeIds.includes(p.id);
                      const atLimit = !checked && attendeeIds.length + 1 >= desk.capacity;
                      return (
                        <label
                          key={p.id}
                          className={[
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            atLimit ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-surface",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox" checked={checked} disabled={atLimit}
                            onChange={(e) => {
                              setAttendeeIds((prev) =>
                                e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                              );
                            }}
                            className="rounded border-line accent-[var(--accent)]"
                          />
                          <Avatar name={p.full_name} size={22} />
                          <span className="truncate">{p.full_name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="bk-comment-meeting" className="mb-1.5 block text-[11px] font-medium text-muted">
                  Notiz <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="bk-comment-meeting" rows={2} value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 280))}
                  placeholder="z. B. „Sprint-Planung“"
                  className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2 text-sm
                             placeholder:text-muted/60 focus-ring"
                />
              </div>
            </div>
          )}

          {/* Buchen - nur wenn noch ein Zeitfenster frei ist (normale Plätze) */}
          {!isFixed && !isMeetingTable && canBookAnything && !ownBooking && (
            <div className="space-y-3.5 border-t border-line pt-3.5">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted">Zeitfenster</p>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-raised p-1">
                  {slotOptions.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={opt.disabled}
                      onClick={() => setSlot(opt.value)}
                      className={[
                        "rounded-md px-2 py-1.5 text-[11px] font-medium transition-all duration-200 focus-ring",
                        slot === opt.value ? "text-accent-ink shadow-sm" : "text-muted hover:text-ink",
                        opt.disabled ? "cursor-not-allowed opacity-35 line-through" : "",
                      ].join(" ")}
                      style={slot === opt.value ? { background: "var(--accent)" } : undefined}
                      title={opt.disabled ? "Bereits vergeben" : undefined}
                    >
                      {SLOT_LABEL[opt.value]}
                    </button>
                  ))}
                </div>
              </div>

              <Checkbox
                id="bk-multiday"
                checked={multiDay}
                onChange={(v) => { setMultiDay(v); if (!v) setRecurring(false); }}
                label="Mehrere Tage"
                hint="Belegte Tage werden übersprungen"
              />

              {multiDay && (
                <div className="animate-fade-in space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Von</span>
                      <input type="date" value={range.from}
                             onChange={(e) => setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))}
                             className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-xs focus-ring" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Bis</span>
                      <input type="date" value={range.to} min={range.from}
                             onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                             className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-xs focus-ring" />
                    </label>
                  </div>
                  <Checkbox id="bk-recurring" checked={recurring} onChange={setRecurring}
                            label="Wiederkehrend an bestimmten Wochentagen"
                            hint="z. B. jeden Montag – statt an jedem Tag im Zeitraum" />
                  {recurring ? (
                    <WeekdayPicker
                      value={weekdays} onChange={setWeekdays}
                      activeTitle="An diesem Wochentag buchen" inactiveTitle="An diesem Wochentag nicht buchen"
                    />
                  ) : (
                    <Checkbox id="bk-skip-we" checked={skipWeekends} onChange={setSkipWeekends}
                              label="Wochenenden auslassen" />
                  )}
                </div>
              )}

              <div>
                <label htmlFor="bk-comment" className="mb-1.5 block text-[11px] font-medium text-muted">
                  Notiz <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="bk-comment" rows={2} value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 280))}
                  placeholder="z. B. „Onboarding neuer Kollege“"
                  className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2 text-sm
                             placeholder:text-muted/60 focus-ring"
                />
              </div>
            </div>
          )}

          {!isFixed && !isMeetingTable && !canBookAnything && !ownBooking && (
            <p className="border-t border-line pt-3.5 text-xs text-muted">
              Dieser Platz ist an dem Tag vollständig belegt.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </CardBody>

        {!isFixed && isMeetingTable && (
          <CardFooter>
            <Button
              className="w-full border !border-accent/50 !bg-transparent font-medium text-accent
                         transition-colors duration-300 hover:!bg-accent hover:!text-accent-ink"
              loading={busy}
              disabled={timeOverlaps || timeTooLong || timeRange.end <= timeRange.start}
              onClick={() => run(() => onBook({
                comment, slot: "full", attendeeIds,
                startTime: timeRange.start, endTime: timeRange.end,
              }))}
            >
              {timeRange.start}–{timeRange.end} Uhr buchen
            </Button>
          </CardFooter>
        )}

        {!isFixed && !isMeetingTable && canBookAnything && !ownBooking && (
          <CardFooter>
            <Button
              className="w-full border !border-accent/50 !bg-transparent font-medium text-accent
                         transition-colors duration-300 hover:!bg-accent hover:!text-accent-ink"
              loading={busy}
              disabled={multiDay && recurring && weekdays.length === 0}
              onClick={() => run(() => onBook({
                comment,
                slot,
                attendeeIds,
                range: multiDay
                  ? { ...range, skipWeekends, weekdays: recurring ? weekdays : undefined }
                  : undefined,
              }))}
            >
              {multiDay ? (recurring ? "Wiederkehrend buchen" : "Zeitraum buchen") : `${SLOT_LABEL[slot]} buchen`}
            </Button>
          </CardFooter>
        )}
      </GlowCard>
    </AnchoredPopover>
  );
}

function DeskGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v6M19 12v6" />
      <rect x="9" y="3" width="6" height="5" rx="1" />
    </svg>
  );
}

/** Kleiner Chat-Button neben einer Person im Info-Panel - startet direkt
 *  eine Direktnachricht, ohne erst durchs Postfach navigieren zu müssen. */
function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Direktnachricht schreiben"
      title="Direktnachricht schreiben"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted
                 transition-colors hover:bg-raised hover:text-accent focus-ring"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </button>
  );
}
