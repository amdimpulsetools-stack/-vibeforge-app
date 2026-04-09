"use client";

import { useEffect, useRef } from "react";
import { Calendar, Users, Shield, Building } from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda Inteligente",
    before:
      "Citas en WhatsApp, olvidos, doble-agendamiento",
    after:
      "Agenda visual con citas, bloqueos, follow-ups y recordatorios. Vinculada a doctores, servicios y consultorios.",
  },
  {
    icon: Users,
    title: "Gestión de Pacientes",
    before:
      "Historial en carpetas físicas o un Excel que nadie actualiza",
    after:
      "Perfil completo de cada paciente: historial de citas, pagos, notas, tags y seguimiento.",
  },
  {
    icon: Shield,
    title: "Control de Equipo",
    before:
      "Todos tienen acceso a todo o nadie sabe qué puede hacer",
    after:
      "4 roles claros: Owner, Admin, Recepcionista, Doctor. Cada uno ve solo lo que necesita.",
  },
  {
    icon: Building,
    title: "Tu Clínica Completa",
    before:
      "5 herramientas diferentes que no se hablan entre sí",
    after:
      "Consultorios, sucursales, servicios con precios, categorías, plantillas clínicas. Todo conectado.",
  },
];

export function Features() {
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
    <section id="features" className="py-20 sm:py-28 bg-white">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 [&.animate-in_.feat-card]:opacity-100 [&.animate-in_.feat-card]:translate-y-0"
      >
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Todo lo que necesitas. Nada que no.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className="feat-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-500 opacity-0 translate-y-6 group"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                  <feat.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{feat.title}</h3>
              </div>

              {/* Before */}
              <div className="mb-3 rounded-lg bg-red-50/50 border border-red-100 p-3">
                <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Antes</span>
                <p className="text-sm text-red-400/80 mt-1 line-through decoration-red-300/50">
                  {feat.before}
                </p>
              </div>

              {/* After */}
              <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-3">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Ahora</span>
                <p className="text-sm text-slate-700 mt-1">{feat.after}</p>
              </div>

              {/* Screenshot placeholder */}
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 h-32 flex items-center justify-center">
                <p className="text-xs text-slate-300">Screenshot — {feat.title}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
