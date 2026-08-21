"use client";

import { useEffect, useRef } from "react";
import {
  BarChart3,
  QrCode,
  Sparkles,
  Rocket,
} from "lucide-react";

interface UpcomingFeature {
  icon: React.ElementType;
  title: string;
  description: string;
}

const upcoming: UpcomingFeature[] = [
  {
    icon: BarChart3,
    title: "Estadísticas avanzadas por asesora",
    description:
      "Conversión, tiempos de respuesta y pipeline de presupuestos por cada miembro del equipo.",
  },
  {
    icon: QrCode,
    title: "Más medios de pago",
    description:
      "Nuevas pasarelas locales para que tus pacientes paguen como prefieran.",
  },
  {
    icon: Sparkles,
    title: "Y más funciones con IA",
    description:
      "La inteligencia que ya resume tus reportes seguirá llegando a más rincones de Yenda.",
  },
];

export function AlwaysImproving() {
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
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-16 sm:py-20 bg-slate-950 overflow-hidden">
      {/* Emerald glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-80 w-[40rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div
        ref={sectionRef}
        className="relative mx-auto max-w-7xl px-6 [&.animate-in_.upcoming-card]:opacity-100 [&.animate-in_.upcoming-card]:translate-y-0"
      >
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 mb-5">
            <Rocket className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              En constante evolución
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Lo mejor: Yenda no deja de crecer
          </h2>
          <p className="mt-3 text-lg text-slate-400 max-w-2xl mx-auto">
            Cada mes sale algo nuevo. No pagas actualización ni instalas nada para
            que tu clínica tenga lo último. El precio de hoy es el precio que mantienes.
          </p>
        </div>

        {/* Upcoming grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {upcoming.map((feature, i) => (
            <div
              key={feature.title}
              className="upcoming-card rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-emerald-500/40 hover:bg-white/[0.07] transition-all duration-500 opacity-0 translate-y-6 group"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Próximamente
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-slate-400">
              Tu suscripción incluye cada mejora del sistema apenas se publica.
              Sin costo de actualización, sin instalar nada.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
