export default function SchedulerLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-lg bg-muted" />
          <div className="h-9 w-24 rounded-lg bg-muted" />
        </div>
      </div>
      {/* Grid skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-6 w-full rounded bg-muted" />
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-10 w-full rounded bg-muted/50" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
