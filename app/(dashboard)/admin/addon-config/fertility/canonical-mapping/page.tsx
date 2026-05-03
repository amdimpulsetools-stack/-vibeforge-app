import { MappingForm } from "./mapping-form";

export const metadata = {
  title: "Configuración inicial — Pack Fertilidad",
};

export default function CanonicalMappingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Pack Fertilidad — Básico
        </p>
        <h1 className="text-2xl font-bold">Configuración inicial</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Para que el sistema de seguimientos funcione, necesitamos saber qué
          servicios de tu catálogo corresponden a cada etapa del journey de
          fertilidad. Una categoría puede tener varios servicios asociados —
          por ejemplo, si tienes &ldquo;Primera consulta presencial&rdquo; y
          &ldquo;Primera consulta virtual&rdquo;, ambos se asocian a la misma
          categoría.
        </p>
      </header>

      <MappingForm />
    </div>
  );
}
