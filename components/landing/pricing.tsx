"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowRight, Building2, Phone, Shield } from "lucide-react";

const plans = [
  {
    name: "Independiente",
    priceMonthly: "129",
    priceAnnual: "107.50",
    savingsAnnual: "258",
    anchor: "Menos de S/5 al día por tener tu consultorio en orden",
    anchorAnnual: "Ahorra S/258 al año — 2 meses gratis",
    features: [
      "1 doctor · 1 consultorio",
      "Historia clínica SOAP + recetas",
      "Órdenes de exámenes imprimibles",
      "Recordatorios WhatsApp y email",
      "Reserva online para pacientes",
      "Cobros y control de deudas",
      "Reportes básicos",
    ],
    highlight: false,
    badge: "IA incluida",
  },
  {
    name: "Centro Médico",
    priceMonthly: "349",
    priceAnnual: "290.83",
    savingsAnnual: "698",
    anchor: "Menos de 3 consultas al mes y la herramienta se paga sola",
    anchorAnnual: "Ahorra S/698 al año — 2 meses gratis",
    features: [
      "3 doctores · 3 consultorios",
      "2 recepcionistas / asistentes",
      "Todo lo de Independiente, más:",
      "Reportes completos + exportación CSV",
      "Resumen diario del equipo por email",
      "4 roles y permisos completos",
      "3 módulos de especialidad",
    ],
    highlight: true,
    badge: "IA incluida · Más popular",
  },
  {
    name: "Clínica",
    priceMonthly: "649",
    priceAnnual: "540.83",
    savingsAnnual: "1,298",
    anchor: "Con un tratamiento mediano al mes, ya pagaste tu suscripción",
    anchorAnnual: "Ahorra S/1,298 al año — 2 meses gratis",
    features: [
      "10 doctores · 7 consultorios",
      "Recepcionistas ilimitadas",
      "Todo lo de Centro Médico, más:",
      "Todos los módulos de especialidad",
      "Onboarding personalizado 1-on-1",
      "Soporte prioritario (<4 horas)",
      "Migración de datos asistida",
    ],
    highlight: false,
    badge: "IA incluida",
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

        {/* Enterprise banner */}
        <div className="mt-12 mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-8 md:p-10 text-white shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
                  <Building2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Enterprise</h3>
                  <p className="text-xs text-slate-400">Para clínicas con más de 15 doctores</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed max-w-lg">
                Infraestructura dedicada, funciones ultrapersonalizadas y escalabilidad sin límites.
                Para operaciones que necesitan control total sobre datos, integraciones y soporte.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                {[
                  { icon: Shield, text: "Base de datos dedicada" },
                  { icon: Sparkles, text: "IA sin límites + reportes custom" },
                  { icon: Phone, text: "Soporte dedicado 24/7" },
                ].map((item) => (
                  <span key={item.text} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                    <item.icon className="h-3 w-3 text-emerald-400" />
                    {item.text}
                  </span>
                ))}
              </div>
            </div>
            <div className="shrink-0">
              <Link
                href="/contacto"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-emerald-50 transition-colors whitespace-nowrap"
              >
                Contactar ventas
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-[10px] text-slate-500 mt-2 text-center">Precio a medida</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
