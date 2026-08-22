"use client";
import { useEffect, useState } from "react";
import { Desk, Booking } from "@/lib/api";
import AnchoredPopover from "./ui/AnchoredPopover";
import { GlowCard, CardHeader, CardBody, CardFooter } from "./ui/GlowCard";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";
import { formatLong, toISO, fromISO } from "./ui/DatePicker";

type Props = {
  anchor: DOMRect | null;
  desk: Desk | null;
  booking: Booking | null;
  date: string;
  canManage: boolean;
  onClose: () => void;
  onBook: (args: { comment: string; range?: { from: string; to: string; skipWeekends: boolean } }) => Promise<void>;
  onCancel: (booking: Booking) => Promise<void>;
};

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export default function BookingPopover({
  anchor, desk, booking, date, canManage, onClose, onBook, onCancel,
}: Props) {
  const [comment, setComment] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [range, setRange] = useState({ from: date, to: addDays(date, 4) });
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComment("");
    setMultiDay(false);
    setRange({ from: date, to: addDays(date, 4) });
    setError(null);
  }, [desk?.id, date]);

  if (!desk || !anchor) return null;

  const isOwn = !!booking && canManage;
  const isForeign = !!booking && !canManage;
  const isFixed = !!desk.fixed_user_id;

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

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} width={300}>
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
            <p className="text-sm text-muted">
              Dieser Platz ist fest an <span className="text-ink">{desk.fixed_user_name}</span> vergeben
              und kann nicht gebucht werden.
            </p>
          )}

          {isForeign && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised
                                 text-[11px] font-semibold text-muted">
                  {booking!.user_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{booking!.user_name}</p>
                  <p className="text-xs text-muted">belegt diesen Platz</p>
                </div>
              </div>
              {booking!.comment && (
                <p className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
                  {booking!.comment}
                </p>
              )}
            </>
          )}

          {isOwn && (
            <>
              <p className="text-sm">
                Du hast diesen Platz gebucht.
              </p>
              {booking!.comment && (
                <p className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
                  {booking!.comment}
                </p>
              )}
            </>
          )}

          {!booking && !isFixed && (
            <>
              <Checkbox
                id="bk-multiday"
                checked={multiDay}
                onChange={setMultiDay}
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
                  <Checkbox
                    id="bk-skip-we"
                    checked={skipWeekends}
                    onChange={setSkipWeekends}
                    label="Wochenenden auslassen"
                  />
                </div>
              )}

              <div>
                <label htmlFor="bk-comment" className="mb-1.5 block text-[11px] font-medium text-muted">
                  Notiz <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="bk-comment" rows={2} value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 280))}
                  placeholder="z. B. „nur vormittags“"
                  className="w-full resize-none rounded-lg border border-line bg-raised px-3 py-2 text-sm
                             placeholder:text-muted/60 focus-ring"
                />
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </CardBody>

        {!isFixed && !isForeign && (
          <CardFooter>
            {isOwn ? (
              <Button variant="danger" className="w-full" loading={busy}
                      onClick={() => run(() => onCancel(booking!))}>
                Buchung stornieren
              </Button>
            ) : (
              <Button
                className="w-full border !border-accent/50 !bg-transparent font-medium text-accent
                           transition-colors duration-300 hover:!bg-accent hover:!text-accent-ink"
                loading={busy}
                onClick={() => run(() => onBook({
                  comment,
                  range: multiDay ? { ...range, skipWeekends } : undefined,
                }))}
              >
                {multiDay ? "Zeitraum buchen" : "Platz buchen"}
              </Button>
            )}
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
