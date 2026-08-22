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
