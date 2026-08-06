export default function ReportsLoading() {
  return (
    // El skeleton acompaña el full-bleed de la página: cancela el p-4 del
    // `main` en móvil y aporta su propio gutter, para que no haya salto
    // visual al hidratar. Desde md, idéntico a antes.
    <div className="-mx-4 -mt-4 space-y-4 p-4 animate-pulse md:mx-0 md:mt-0 md:p-0">
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
