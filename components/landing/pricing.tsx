"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowRight, Building2, Phone, Shield } from "lucide-react";
import { exceedsMpPreapprovalCap } from "@/lib/billing/constants";

type Cadence = "monthly" | "semiannual" | "annual";

const plans = [
  {
    name: "Independiente",
    priceMonthly: "129",
    priceSemiannual: "118.25", // 5.5 mo / 6 mo = 8.3% off
    priceAnnual: "107.50",     // 10 mo / 12 mo = 16.7% off
    savingsSemiannual: "64.50",
    savingsAnnual: "258",
    anchor: "Un solo paciente que no falta al mes ya te pagó el sistema",
    anchorSemiannual: "Ahorra S/64.50 — medio mes gratis",
    anchorAnnual: "Ahorra S/258 al año — 2 meses gratis",
    features: [
      "1 doctor · 1 consultorio",
      "1 recepcionista / asistente",
      "Pacientes y citas ilimitados",
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
    priceSemiannual: "319.92",
    priceAnnual: "290.83",
    savingsSemiannual: "174.50",
    savingsAnnual: "698",
    anchor: "3 consultas al mes cubren el plan completo",
    anchorSemiannual: "Ahorra S/174.50 — medio mes gratis",
    anchorAnnual: "Ahorra S/698 al año — 2 meses gratis",
    features: [
      "3 doctores · 3 consultorios",
      "2 recepcionistas / asistentes",
      "Pacientes y citas ilimitados",
      "Todo lo de Independiente, más:",
      "Reportes completos + exportación CSV",
      "Resumen diario del equipo por email",
      "4 roles y permisos completos",
      "3 módulos de especialidad",
    ],
    highlight: true,
    badge: "El que recomendamos",
  },
  {
    name: "Clínica",
    priceMonthly: "649",
    priceSemiannual: "594.92",
    priceAnnual: "540.83",
    savingsSemiannual: "324.50",
    savingsAnnual: "1,298",
    anchor: "Un tratamiento de S/700 al mes cubre la suscripción de toda la clínica",
    anchorSemiannual: "Ahorra S/324.50 — medio mes gratis",
    anchorAnnual: "Ahorra S/1,298 al año — 2 meses gratis",
    features: [
      "10 doctores · 10 consultorios",
      "10 doctores, 3 recepcionistas y hasta 15 personas en total",
      "Pacientes y citas ilimitados",
      "Todo lo de Centro Médico, más:",
      "Todos los módulos de especialidad",
      "Te acompañamos por videollamada hasta que tu clínica esté funcionando",
      "Te respondemos en menos de 4 horas, de lunes a sábado",
      "Pasamos tus pacientes desde tu Excel o tu sistema actual — nosotros, no tú",
    ],
    highlight: false,
    badge: "IA incluida",
  },
];

function priceFor(plan: (typeof plans)[number], cadence: Cadence) {
  if (cadence === "monthly") return plan.priceMonthly;
  if (cadence === "semiannual") return plan.priceSemiannual;
  return plan.priceAnnual;
}

function anchorFor(plan: (typeof plans)[number], cadence: Cadence) {
  if (cadence === "monthly") return plan.anchor;
  if (cadence === "semiannual") return plan.anchorSemiannual;
  return plan.anchorAnnual;
}

/**
 * Cobro por período (lo que Mercado Pago intenta cobrar de una vez), no el
 * precio mensual prorrateado que muestra la tarjeta.
 */
function periodTotal(plan: (typeof plans)[number], cadence: Cadence) {
  const monthly = Number(priceFor(plan, cadence));
  if (Number.isNaN(monthly)) return null;
  if (cadence === "semiannual") return monthly * 6;
  if (cadence === "annual") return monthly * 12;
  return monthly;
}

export function Pricing() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [cadence, setCadence] = useState<Cadence>("monthly");

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
    <section id="pricing" className="py-24 sm:py-36 bg-white">
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

          {/* Billing toggle — 3 cadences with progressive discount */}
          <div className="mt-8 inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setCadence("monthly")}
              className={`rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold transition-all ${
                cadence === "monthly"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setCadence("semiannual")}
              className={`rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold transition-all ${
                cadence === "semiannual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Semestral
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                ½ mes gratis
              </span>
            </button>
            <button
              onClick={() => setCadence("annual")}
              className={`rounded-xl px-4 py-2.5 min-h-11 text-sm font-semibold transition-all ${
                cadence === "annual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Anual
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
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
                  ? "pricing-popular border-transparent bg-white md:scale-105 md:-my-2 z-10"
                  : "border-slate-200 bg-white shadow-sm hover:shadow-md"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-gradient-to-r from-emerald-500 to-violet-600 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  {plan.badge}
                </span>
              )}

              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>

              {/* key={cadence} remonta el bloque al cambiar la cadencia:
                  un fadeUp corto (250ms) señala que el precio cambió.
                  prefers-reduced-motion lo anula vía la media query global. */}
              <div className="mt-4" key={cadence}>
                <div className="flex items-baseline gap-1 motion-safe:animate-[fadeUp_0.25s_ease-out]">
                  <span className="text-sm text-slate-500">S/</span>
                  <span className="text-4xl font-extrabold text-slate-900 tabular-nums">
                    {priceFor(plan, cadence)}
                  </span>
                  <span className="text-sm text-slate-500">/mes</span>
                </div>
                {cadence !== "monthly" && (
                  <p className="text-xs text-slate-500 mt-0.5 line-through motion-safe:animate-[fadeUp_0.3s_ease-out]">
                    S/{plan.priceMonthly}/mes
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1 motion-safe:animate-[fadeUp_0.35s_ease-out]">
                  {anchorFor(plan, cadence)}
                </p>
                {/* Mercado Pago no acepta cobros por período de más de
                    S/1,500, así que estas cadencias salen como "Próximamente"
                    en el checkout. Sin este aviso la landing las anunciaba con
                    su descuento y el visitante se enteraba del muro después de
                    registrarse. */}
                {exceedsMpPreapprovalCap(periodTotal(plan, cadence)) && (
                  <p className="mt-1.5 text-xs font-medium text-amber-600">
                    Pago {cadence === "annual" ? "anual" : "semestral"} disponible
                    próximamente — por ahora, mensual
                  </p>
                )}
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
                    ? "btn-popular-cta text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                Empezar mis 14 días gratis
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <p className="mt-2 text-center text-xs text-slate-500">
                Sin tarjeta. Cancelas cuando quieras.
              </p>
            </div>
          ))}
        </div>

        {/* Fila de riesgo cero — analgesia aplicada donde duele (el precio) */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
          {[
            "14 días gratis",
            "Sin tarjeta",
            "Cancela en 1 clic",
            "Te exportamos tus datos cuando quieras",
            "Te ayudamos con la migración",
          ].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" />
              {t}
            </span>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 mt-10 max-w-xl mx-auto">
          ¿Te falta un doctor o un consultorio más? Los{" "}
          <span className="font-medium text-slate-700">agregas sueltos</span>{" "}
          sin tener que saltar al plan siguiente.
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
                  <p className="text-xs text-slate-500">Para clínicas con más de 15 doctores</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed max-w-lg">
                Tu propia base de datos, integraciones con tus sistemas actuales y un equipo asignado a tu cuenta.
                Para operaciones que necesitan control total sobre datos, integraciones y soporte.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                {[
                  { icon: Shield, text: "Base de datos dedicada" },
                  { icon: Sparkles, text: "IA sin límites + reportes custom" },
                  { icon: Phone, text: "Canal directo con tu equipo asignado" },
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
                Hablar con el equipo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-xs text-slate-500 mt-2 text-center">Precio a medida</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
