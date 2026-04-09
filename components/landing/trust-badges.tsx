import { Lock, Globe, Hospital, BrainCircuit } from "lucide-react";

const badges = [
  { icon: Lock, label: "Datos encriptados" },
  { icon: Globe, label: "Soporte en español" },
  { icon: Hospital, label: "Hecho para LATAM" },
  { icon: BrainCircuit, label: "IA incluida en todos los planes" },
];

export function TrustBadges() {
  return (
    <section className="relative border-y border-slate-100 bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {badges.map((b) => (
            <div
              key={b.label}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm"
            >
              <b.icon className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
