export default function ReportsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-36 rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-border/60 bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-border/60 bg-card" />
    </div>
  );
}
