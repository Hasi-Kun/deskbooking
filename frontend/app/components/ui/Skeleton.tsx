export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shimmer rounded-md ${className}`} />;
}

/** Platzhalter fuer den Grundriss, waehrend Plaetze und Buchungen laden. */
export function FloorSkeleton() {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl2" />
        ))}
      </div>
      <span className="sr-only">Grundriss wird geladen…</span>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Vertikale Zeitleiste - für das Aktivitäten-Log: Avatar + zwei Textzeilen
 *  + Status-Badge, mit der Verbindungslinie zwischen den Einträgen, damit
 *  die Ladeansicht schon wie die spätere Timeline aussieht statt wie eine
 *  generische Liste. */
export function TimelineSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="relative flex gap-3 pb-6 last:pb-0">
          {i < rows - 1 && (
            <span className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden="true" />
          )}
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Formular: Label+Feld-Paare übereinander plus ein Button - für Seiten wie
 *  "Konto", bevor der eigentliche Stand vom Server da ist. */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="space-y-5 rounded-xl2 border border-line bg-surface p-4" aria-busy="true">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
  );
}

/** Tabellenkopf + N Zeilen - für die Matrix-Ansicht der Belegungsübersicht. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-busy="true">
      <div className="flex gap-3 border-b border-line pb-2.5">
        <Skeleton className="h-3.5 w-24" />
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3.5 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-6 flex-1 rounded-md" />)}
        </div>
      ))}
    </div>
  );
}

/** Chat-Verlauf: ein- und ausgehende Sprechblasen plus Eingabezeile - für
 *  den Team-Chat/DM-Thread, bevor die ersten Nachrichten geladen sind. */
export function ChatSkeleton() {
  return (
    <div className="flex h-[560px] flex-col justify-end gap-4 rounded-2xl border border-line bg-surface p-4" aria-busy="true">
      <div className="flex items-start gap-2.5">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-10 w-48 rounded-2xl rounded-tl-none" />
        </div>
      </div>
      <div className="flex items-start justify-end gap-2.5">
        <Skeleton className="h-8 w-40 rounded-2xl rounded-tr-none" />
      </div>
      <div className="flex items-start gap-2.5">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-14 w-56 rounded-2xl rounded-tl-none" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}
