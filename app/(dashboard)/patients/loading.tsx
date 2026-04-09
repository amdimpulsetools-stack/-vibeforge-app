export default function PatientsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-muted" />
        <div className="h-9 w-32 rounded-lg bg-muted" />
      </div>
      {/* Search bar */}
      <div className="h-10 w-full rounded-xl bg-muted" />
      {/* Table rows */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-9 w-9 rounded-full bg-muted" />
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted flex-1" />
            <div className="h-4 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
