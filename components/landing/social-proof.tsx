import { Lock, CloudUpload, Headphones, BadgeDollarSign } from "lucide-react";

const signals = [
  { icon: Lock, label: "Datos encriptados" },
  { icon: CloudUpload, label: "Backups automáticos" },
  { icon: Headphones, label: "Soporte en español" },
  { icon: BadgeDollarSign, label: "Precios en soles" },
];

export function SocialProof() {
  return (
    <section className="py-16 sm:py-20 bg-slate-50/50">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Hecho para clínicas reales
        </h2>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Sé de los primeros 100 en probarlo. Tu feedback construye el producto.
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {signals.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm"
            >
              <s.icon className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-slate-600">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
