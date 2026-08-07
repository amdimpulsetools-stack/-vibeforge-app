export default function ReportsLoading() {
  return (
    // El skeleton acompaña el full-bleed de la página en los dos
    // breakpoints: cancela el gutter del div interno del `main` (`p-4`
    // móvil / `p-7` desde md) y aporta el suyo propio (`p-4 md:p-6`, el
    // mismo que los headers de la página real), para que no haya salto
    // visual al hidratar.
    <div className="-mx-4 -mt-4 space-y-4 p-4 animate-pulse md:-mx-7 md:-mt-7 md:p-6">
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
