export default function SchedulerLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton — dos filas en móvil (navegación / acciones), una en md+ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-muted md:h-9 md:w-9" />
          <div className="h-6 flex-1 rounded-lg bg-muted md:w-48 md:flex-none" />
          <div className="h-10 w-10 shrink-0 rounded-lg bg-muted md:h-9 md:w-9" />
          <div className="h-10 w-16 shrink-0 rounded-lg bg-muted md:h-9" />
        </div>
        <div className="flex w-full items-center justify-end gap-2 md:w-auto">
          <div className="h-10 w-24 rounded-lg bg-muted md:h-9" />
          <div className="h-10 w-24 rounded-lg bg-muted md:h-9" />
        </div>
      </div>

      {/* Agenda skeleton — lista de franjas en móvil, columnas en md+ */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 md:p-4">
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-10 w-[72px] shrink-0 rounded bg-muted/50" />
              <div className="h-10 flex-1 rounded bg-muted/50" />
            </div>
          ))}
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-4">
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
