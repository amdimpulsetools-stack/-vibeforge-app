"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, MessageCircle, Info, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

// WhatsApp Business API pricing per country (USD per message)
// Source: Meta Business pricing page (2026)
const COUNTRIES = [
  { code: "PE", name: "Perú", marketing: 0.0703, utility: 0.0200 },
  { code: "CO", name: "Colombia", marketing: 0.0150, utility: 0.0040 },
  { code: "MX", name: "México", marketing: 0.0360, utility: 0.0080 },
  { code: "AR", name: "Argentina", marketing: 0.0618, utility: 0.0500 },
  { code: "CL", name: "Chile", marketing: 0.0889, utility: 0.0400 },
  { code: "EC", name: "Ecuador", marketing: 0.0455, utility: 0.0200 },
  { code: "BO", name: "Bolivia", marketing: 0.0304, utility: 0.0150 },
  { code: "BR", name: "Brasil", marketing: 0.0500, utility: 0.0150 },
  { code: "US", name: "Estados Unidos", marketing: 0.0250, utility: 0.0040 },
  { code: "OTHER", name: "Otros", marketing: 0.0816, utility: 0.0250 },
];

const FAQ_ITEMS = [
  {
    q: "¿Cómo se usa esta calculadora de precios de WhatsApp?",
    a: "Selecciona el país donde se encuentran tus pacientes, luego ajusta la cantidad de mensajes de marketing y de utilidad que planeas enviar mensualmente. La calculadora estimará el costo total basado en las tarifas oficiales de Meta.",
  },
  {
    q: "¿Qué son las plantillas de Utilidad?",
    a: "Son mensajes transaccionales: recordatorios de citas, confirmaciones, cambios de horario, recibos de pago. En el contexto médico, los recordatorios de citas y las confirmaciones son plantillas de utilidad. Son más baratas que las de marketing.",
  },
  {
    q: "¿Qué son las plantillas de Marketing?",
    a: "Son mensajes promocionales: ofertas, campañas de seguimiento, felicitaciones de cumpleaños, promociones de servicios nuevos. En clínicas, los emails de seguimiento de pacientes inactivos y los saludos de cumpleaños se clasifican como marketing.",
  },
  {
    q: "¿Las plantillas de Utilidad son gratuitas?",
    a: "Las plantillas de Utilidad son gratuitas si se envían dentro de las 24 horas posteriores a un mensaje del paciente (ventana de servicio). Fuera de esa ventana, se cobran según la tarifa del país.",
  },
  {
    q: "¿Cómo envía REPLACE los mensajes de WhatsApp?",
    a: "REPLACE se integra con WhatsApp Business API a través de Meta. Los recordatorios de citas (24h y 2h antes) se envían automáticamente como plantillas de utilidad. Los mensajes de cumpleaños y seguimiento se envían como plantillas de marketing.",
  },
];

export default function CalculadoraWhatsAppPage() {
  const [country, setCountry] = useState("PE");
  const [marketingQty, setMarketingQty] = useState(0);
  const [utilityQty, setUtilityQty] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  const costs = useMemo(() => {
    const marketingCost = marketingQty * selectedCountry.marketing;
    const utilityCost = utilityQty * selectedCountry.utility;
    return {
      marketing: marketingCost,
      utility: utilityCost,
      total: marketingCost + utilityCost,
    };
  }, [marketingQty, utilityQty, selectedCountry]);

  // Medical context calculator
  const [citasDiarias, setCitasDiarias] = useState(15);
  const [diasSemana, setDiasSemana] = useState(5);

  const medicalEstimate = useMemo(() => {
    const citasMes = citasDiarias * diasSemana * 4.33;
    // 2 reminders per appointment (24h + 2h) = utility
    const reminderMessages = Math.round(citasMes * 2);
    // 1 confirmation per appointment = utility
    const confirmationMessages = Math.round(citasMes);
    // Follow-ups (10% of patients per month) = marketing
    const followUpMessages = Math.round(citasMes * 0.1);
    // Birthdays (~8% of patients per month) = marketing
    const birthdayMessages = Math.round(citasMes * 0.08);

    const totalUtility = reminderMessages + confirmationMessages;
    const totalMarketing = followUpMessages + birthdayMessages;

    const utilityCost = totalUtility * selectedCountry.utility;
    const marketingCost = totalMarketing * selectedCountry.marketing;

    return {
      citasMes: Math.round(citasMes),
      reminderMessages,
      confirmationMessages,
      followUpMessages,
      birthdayMessages,
      totalUtility,
      totalMarketing,
      utilityCost,
      marketingCost,
      totalCost: utilityCost + marketingCost,
    };
  }, [citasDiarias, diasSemana, selectedCountry]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-16 bg-gradient-to-b from-green-50 to-white">
        <div className="mx-auto max-w-5xl px-4 md:px-6 pt-16 pb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100">
              <MessageCircle className="h-6 w-6 text-green-600" />
            </div>
            <span className="text-sm font-semibold text-green-700">Calculadora de precios de WhatsApp</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight max-w-3xl">
            Estima el costo de tus mensajes de WhatsApp para tu clínica
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl">
            Optimiza tus recordatorios de citas y seguimientos por WhatsApp. Conoce exactamente cuánto costará cada mensaje.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="px-4 md:px-6 pb-16">
        <div className="mx-auto max-w-5xl">

          {/* Medical context estimator */}
          <div className="mb-12 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Estimador rápido para clínicas
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Ingresa los datos de tu consultorio y calculamos automáticamente cuántos mensajes necesitas.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Citas por día</label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={citasDiarias}
                  onChange={(e) => setCitasDiarias(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">1</span>
                  <span className="text-sm font-bold text-emerald-700">{citasDiarias} citas/día</span>
                  <span className="text-xs text-slate-400">50</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Días de atención por semana</label>
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={diasSemana}
                  onChange={(e) => setDiasSemana(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">1</span>
                  <span className="text-sm font-bold text-emerald-700">{diasSemana} días/sem</span>
                  <span className="text-xs text-slate-400">7</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="mt-6 grid gap-3 md:grid-cols-4 text-center">
              <div className="rounded-xl bg-white border border-emerald-200 p-3">
                <p className="text-2xl font-bold text-slate-900">{medicalEstimate.citasMes}</p>
                <p className="text-[10px] text-slate-500">Citas/mes estimadas</p>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200 p-3">
                <p className="text-2xl font-bold text-blue-600">{medicalEstimate.totalUtility}</p>
                <p className="text-[10px] text-slate-500">Mensajes de utilidad</p>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200 p-3">
                <p className="text-2xl font-bold text-violet-600">{medicalEstimate.totalMarketing}</p>
                <p className="text-[10px] text-slate-500">Mensajes de marketing</p>
              </div>
              <div className="rounded-xl bg-emerald-600 p-3">
                <p className="text-2xl font-bold text-white">${medicalEstimate.totalCost.toFixed(2)}</p>
                <p className="text-[10px] text-emerald-200">Costo estimado/mes</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 text-xs text-slate-500">
              <p>📱 {medicalEstimate.reminderMessages} recordatorios (24h + 2h antes de cada cita)</p>
              <p>✅ {medicalEstimate.confirmationMessages} confirmaciones de cita</p>
              <p>🔄 {medicalEstimate.followUpMessages} seguimientos de pacientes inactivos</p>
              <p>🎂 {medicalEstimate.birthdayMessages} saludos de cumpleaños</p>
            </div>
          </div>

          {/* Manual calculator */}
          <div className="grid gap-12 md:grid-cols-2 items-start">
            {/* Left: explanation */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Calculadora manual</h2>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                Para enviar recordatorios automáticos por WhatsApp, necesitas usar plantillas de mensaje aprobadas por Meta.
              </p>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                Meta cobra por cada mensaje de plantilla enviado. Las tarifas dependen del <strong>tipo de plantilla</strong> (marketing o utilidad) y del <strong>país</strong> donde se encuentra el paciente.
              </p>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Usa esta calculadora para estimar tus gastos mensuales en mensajería.
              </p>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Los precios indicados están sujetos a cambios por parte de Meta. Consulta la{" "}
                    <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener" className="font-semibold underline">
                      página de Meta
                    </a>{" "}
                    para conocer las últimas actualizaciones.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-500">
                <Info className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <p>Las plantillas de Utilidad son <strong>gratuitas</strong> si se envían en un plazo de 24 horas en respuesta a un mensaje del paciente.</p>
              </div>
            </div>

            {/* Right: calculator */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-6">
              {/* Country selector */}
              <div className="mb-6">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">País o región</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-300"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Los países que no figuran se clasifican como &laquo;Otros&raquo; y están sujetos a tarifas por defecto.
                </p>
              </div>

              <hr className="my-5 border-slate-100" />

              {/* Marketing templates */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">Plantillas de marketing</span>
                    <button className="text-slate-400 hover:text-slate-600">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">${costs.marketing.toFixed(2)}</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">${selectedCountry.marketing.toFixed(4)} / mensaje</p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={10}
                    value={marketingQty}
                    onChange={(e) => setMarketingQty(Number(e.target.value))}
                    className="flex-1 accent-emerald-600"
                  />
                  <div className="w-20">
                    <label className="text-[9px] text-slate-400 block text-center">Cantidad</label>
                    <input
                      type="number"
                      min={0}
                      value={marketingQty}
                      onChange={(e) => setMarketingQty(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Utility templates */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">Plantillas de utilidad</span>
                    <button className="text-slate-400 hover:text-slate-600">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">${costs.utility.toFixed(2)}</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">${selectedCountry.utility.toFixed(4)} / mensaje</p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={50}
                    value={utilityQty}
                    onChange={(e) => setUtilityQty(Number(e.target.value))}
                    className="flex-1 accent-emerald-600"
                  />
                  <div className="w-20">
                    <label className="text-[9px] text-slate-400 block text-center">Cantidad</label>
                    <input
                      type="number"
                      min={0}
                      value={utilityQty}
                      onChange={(e) => setUtilityQty(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="rounded-xl bg-emerald-600 p-5 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">Estimado:</span>
                  <span className="text-3xl font-extrabold">${costs.total.toFixed(2)}</span>
                </div>
                <p className="text-xs text-emerald-200 mt-1">por mes (USD)</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Preguntas frecuentes</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-900 pr-4">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${openFaq === idx ? "rotate-180" : ""}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-slate-600 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 md:p-12 text-center text-white shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold">Prueba REPLACE gratis durante 14 días</h2>
            <p className="mt-2 text-emerald-100 max-w-xl mx-auto">
              Prueba REPLACE y envía tus primeros recordatorios automáticos por WhatsApp.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-all w-full sm:w-auto">
                Prueba gratis
              </Link>
              <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 px-6 text-sm font-semibold text-white hover:bg-white/10 transition-all w-full sm:w-auto">
                Ver planes
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
