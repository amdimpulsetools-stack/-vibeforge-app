import { SettingsForm } from "./settings-form";

export const metadata = {
  title: "Configuración — Pack Fertilidad",
};

export default function FertilitySettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Pack Fertilidad — Básico
        </p>
        <h1 className="text-2xl font-bold">Configuración del módulo</h1>
        <p className="text-sm text-muted-foreground">
          Ajusta los plazos de los seguimientos automáticos, el tono por
          defecto de los mensajes y el LTV promedio que se usa para estimar
          el revenue atribuido.
        </p>
      </header>

      <SettingsForm />
    </div>
  );
}
