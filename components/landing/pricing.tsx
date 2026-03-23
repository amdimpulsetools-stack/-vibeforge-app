"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Independiente",
    priceMonthly: "69.90",
    priceAnnual: "58.25",
    savingsAnnual: "139.80",
    anchor: "Menos de lo que cobras por una consulta",
    anchorAnnual: "Ahorra S/139.80 al año — 2 meses gratis",
    features: [
      "1 doctor",
      "150 pacientes",
      "100 citas/mes",
      "1 consultorio",
      "1 miembro de equipo",
      "Asistente IA (básico)",
      "Addons disponibles",
    ],
    highlight: false,
    badge: null,
  },
  {
    name: "Centro Médico",
    priceMonthly: "169.90",
    priceAnnual: "141.58",
    savingsAnnual: "339.80",
    anchor: "Menos de S/6 al día por tener tu centro organizado",
    anchorAnnual: "Ahorra S/339.80 al año — 2 meses gratis",
    features: [
      "2 doctores",
      "1,000 pacientes",
      "Citas ilimitadas",
      "4 consultorios",
      "Hasta 4 miembros",
      "Asistente IA (avanzado)",
      "Addons disponibles",
    ],
    highlight: true,
    badge: "Más popular",
  },
  {
    name: "Clínica",
    priceMonthly: "569.90",
    priceAnnual: "474.92",
    savingsAnnual: "1,139.80",
    anchor: "Con 10 doctores, son S/57 por doctor al mes",
    anchorAnnual: "Ahorra S/1,139.80 al año — 2 meses gratis",
    features: [
      "10 doctores",
      "Pacientes ilimitados",
      "Citas ilimitadas",
      "10 consultorios",
      "Hasta 14 miembros",
      "Asistente IA (máximo)",
      "Addons disponibles",
    ],
    highlight: false,
    badge: null,
  },
];

export function Pricing() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isAnnual, setIsAnnual] = useState(false);

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
    <section id="pricing" className="py-20 sm:py-28 bg-white">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 [&.animate-in_.price-card]:opacity-100 [&.animate-in_.price-card]:translate-y-0"
      >
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Crece a tu ritmo. Paga solo lo que necesitas.
          </h2>
          <p className="mt-3 text-base text-slate-500 max-w-xl mx-auto">
            Tres planes para cada etapa. Sin contratos, sin sorpresas. IA incluida en todos.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full bg-slate-100 p-1">
            <button
              onClick={() => setIsAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                !isAnnual
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                isAnnual
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Anual
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                2 meses gratis
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`price-card relative rounded-2xl border p-6 transition-all duration-500 opacity-0 translate-y-6 ${
                plan.highlight
                  ? "border-emerald-300 bg-white shadow-xl shadow-emerald-100/40 md:scale-105 md:-my-2 z-10"
                  : "border-slate-200 bg-white shadow-sm hover:shadow-md"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  {plan.badge}
                </span>
              )}

              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>

              <div className="mt-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-slate-400">S/</span>
                  <span className="text-4xl font-extrabold text-slate-900 tabular-nums transition-all">
                    {isAnnual ? plan.priceAnnual : plan.priceMonthly}
                  </span>
                  <span className="text-sm text-slate-400">/mes</span>
                </div>
                {isAnnual && (
                  <p className="text-xs text-slate-400 mt-0.5 line-through">
                    S/{plan.priceMonthly}/mes
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {isAnnual ? plan.anchorAnnual : plan.anchor}
                </p>
              </div>

              {/* IA badge */}
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                <Sparkles className="h-3 w-3" />
                IA incluida
              </div>

              <ul className="mt-5 space-y-2.5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`mt-6 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
                  plan.highlight
                    ? "gradient-primary text-white shadow-md hover:opacity-90 hover:shadow-lg"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                Empezar ahora
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 mt-10 max-w-xl mx-auto">
          ¿Necesitas algo entre planes? Todos incluyen{" "}
          <span className="font-medium text-slate-700">addons flexibles</span>:
          agrega doctores, consultorios o miembros de equipo adicionales sin cambiar de plan.
        </p>
      </div>
    </section>
  );
}
