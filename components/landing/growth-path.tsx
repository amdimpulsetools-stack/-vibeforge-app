"use client";

import { useEffect, useRef } from "react";
import { Stethoscope, Building2, Hospital, ArrowRight } from "lucide-react";

const tiers = [
  {
    icon: Stethoscope,
    title: "Consultorio independiente",
    capacity: "1 doctor, 1 consultorio",
    quote: "Empiezo solo con mi consultorio",
    price: "S/129",
    highlight: false,
  },
  {
    icon: Building2,
    title: "Centro médico",
    capacity: "2 doctores, 4 consultorios",
    quote: "Ya somos un equipo pequeño",
    price: "S/349",
    highlight: true,
  },
  {
    icon: Hospital,
    title: "Clínica mediana",
    capacity: "10 doctores, 10 consultorios",
    quote: "Gestionamos una operación real",
    price: "S/649",
    highlight: false,
  },
];

export function GrowthPath() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 [&.animate-in_.tier-card]:opacity-100 [&.animate-in_.tier-card]:translate-y-0"
      >
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Un sistema para cada etapa de tu crecimiento
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto relative">
          {/* Connecting arrows between cards (desktop) */}
          <div className="hidden md:flex absolute top-1/2 left-[33.33%] -translate-x-1/2 -translate-y-1/2 z-10">
            <ArrowRight className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="hidden md:flex absolute top-1/2 left-[66.66%] -translate-x-1/2 -translate-y-1/2 z-10">
            <ArrowRight className="h-5 w-5 text-emerald-400" />
          </div>

          {tiers.map((tier, i) => (
            <div
              key={tier.title}
              className={`tier-card relative rounded-2xl border p-6 text-center transition-all duration-500 opacity-0 translate-y-6 ${
                tier.highlight
                  ? "border-emerald-200 bg-emerald-50/50 shadow-lg shadow-emerald-100/50 scale-[1.03]"
                  : "border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  Más elegido
                </span>
              )}
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-4 ${
                  tier.highlight ? "bg-emerald-100" : "bg-slate-100"
                }`}
              >
                <tier.icon
                  className={`h-7 w-7 ${
                    tier.highlight ? "text-emerald-600" : "text-slate-500"
                  }`}
                />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{tier.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{tier.capacity}</p>
              <p className="text-sm text-slate-400 italic mt-2">
                &ldquo;{tier.quote}&rdquo;
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">Desde</span>
                <p className="text-2xl font-extrabold text-slate-900">
                  {tier.price}
                  <span className="text-sm font-normal text-slate-400">/mes</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 mt-10 max-w-xl mx-auto">
          No importa en qué etapa estés. La plataforma se adapta a ti, no al revés.
        </p>
      </div>
    </section>
  );
}
