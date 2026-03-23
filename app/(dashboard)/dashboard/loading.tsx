export default function DashboardHomeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border/60 bg-card" />
        ))}
      </div>
      {/* Chart */}
      <div className="h-64 rounded-2xl border border-border/60 bg-card" />
      {/* Table */}
      <div className="h-48 rounded-2xl border border-border/60 bg-card" />
    </div>
  );
}
