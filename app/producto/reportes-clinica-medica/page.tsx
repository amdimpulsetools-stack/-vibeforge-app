import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { Reveal } from "@/components/landing/reveal";
import {
  ArrowRight, ChevronRight, BarChart3, DollarSign, TrendingUp, Users,
  HeartPulse, Wallet, Target, PieChart, MapPin, CheckCircle2,
  Download, Eye, LineChart, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Reportes para Clínica Médica — Dashboards, KPIs y Analítica | REPLACE",
  description:
    "Reportes visuales para tu clínica: ingresos vs metas, retención de pacientes, cobros pendientes, origen de pacientes, demografía y KPIs en tiempo real. Toma decisiones con datos.",
  keywords: [
    "reportes clínica médica", "dashboard consultorio", "KPI médico",
    "retención pacientes", "cobros consultorio", "analytics médico",
  ],
  alternates: { canonical: "/producto/reportes-clinica-medica" },
};

export default function ReportesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-5xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/producto" className="hover:text-emerald-600">Producto</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium">Reportes y Analítica</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold text-orange-700 mb-6">
            <BarChart3 className="h-3.5 w-3.5" />
            Financiero + Retención + Cobros + Marketing
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            Deja de adivinar.
            <br />
            <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              Empieza a saber.
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            ¿Cuánto facturaste este mes? ¿Quién te debe? ¿Qué pacientes no regresaron?
            ¿De dónde vienen los nuevos?
            <strong className="text-slate-900"> Todas las respuestas, en tiempo real.</strong>
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
              Ver mis reportes gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">Ver planes</Link>
          </div>
        </div>

        {/* Dashboard mockup with floating cards */}
        <div className="mt-16 mx-auto max-w-3xl relative lg:max-w-6xl lg:px-44">
          <div className="relative mx-auto max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50">
              <span className="text-sm font-bold text-slate-900">Dashboard — Abril 2026</span>
              <span className="text-[10px] text-slate-500">Actualizado hace 2 min</span>
            </div>
            <div className="p-5">
              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Ingresos", value: "S/. 18,450", trend: "+21%", up: true, color: "emerald" },
                  { label: "Citas", value: "142", trend: "+8%", up: true, color: "blue" },
                  { label: "Pacientes nuevos", value: "12", trend: "-3%", up: false, color: "violet" },
                  { label: "Deuda total", value: "S/. 2,100", trend: "", up: false, color: "red" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500 mb-1">{kpi.label}</p>
                    <p className="text-base font-bold text-slate-900">{kpi.value}</p>
                    {kpi.trend && (
                      <p className={`text-[10px] font-semibold flex items-center gap-0.5 mt-0.5 ${kpi.up ? "text-emerald-600" : "text-red-500"}`}>
                        {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {kpi.trend} vs mes anterior
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-2 gap-4">
                {/* Weekly revenue line chart */}
                <div className="rounded-lg border border-slate-100 p-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Ingresos por semana</p>
                  <svg viewBox="0 0 240 80" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line x1="30" y1="10" x2="230" y2="10" stroke="#f1f5f9" strokeWidth="0.5" />
                    <line x1="30" y1="30" x2="230" y2="30" stroke="#f1f5f9" strokeWidth="0.5" />
                    <line x1="30" y1="50" x2="230" y2="50" stroke="#f1f5f9" strokeWidth="0.5" />
                    <line x1="30" y1="70" x2="230" y2="70" stroke="#f1f5f9" strokeWidth="0.5" />
                    {/* Y labels */}
                    <text x="26" y="13" fontSize="5" fill="#94a3b8" textAnchor="end">5k</text>
                    <text x="26" y="33" fontSize="5" fill="#94a3b8" textAnchor="end">4k</text>
                    <text x="26" y="53" fontSize="5" fill="#94a3b8" textAnchor="end">3k</text>
                    <text x="26" y="73" fontSize="5" fill="#94a3b8" textAnchor="end">2k</text>
                    {/* Area fill */}
                    <path d="M50,55 L90,38 L130,42 L170,22 L210,15 L210,70 L50,70 Z" fill="url(#rev-grad)" />
                    {/* Line */}
                    <polyline points="50,55 90,38 130,42 170,22 210,15" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Dots */}
                    <circle cx="50" cy="55" r="2.5" fill="#fff" stroke="#10b981" strokeWidth="1.5" />
                    <circle cx="90" cy="38" r="2.5" fill="#fff" stroke="#10b981" strokeWidth="1.5" />
                    <circle cx="130" cy="42" r="2.5" fill="#fff" stroke="#10b981" strokeWidth="1.5" />
                    <circle cx="170" cy="22" r="2.5" fill="#fff" stroke="#10b981" strokeWidth="1.5" />
                    <circle cx="210" cy="15" r="3" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
                    {/* X labels */}
                    <text x="50" y="78" fontSize="5" fill="#94a3b8" textAnchor="middle">Sem 1</text>
                    <text x="90" y="78" fontSize="5" fill="#94a3b8" textAnchor="middle">Sem 2</text>
                    <text x="130" y="78" fontSize="5" fill="#94a3b8" textAnchor="middle">Sem 3</text>
                    <text x="170" y="78" fontSize="5" fill="#94a3b8" textAnchor="middle">Sem 4</text>
                    <text x="210" y="78" fontSize="5" fill="#94a3b8" textAnchor="middle">Actual</text>
                  </svg>
                </div>

                {/* Patient origin donut chart */}
                <div className="rounded-lg border border-slate-100 p-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Origen de pacientes</p>
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 80 80" className="w-20 h-20 shrink-0">
                      {/* Instagram 34% */}
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#a855f7" strokeWidth="8"
                        strokeDasharray="65.03 123.57" strokeDashoffset="0"
                        transform="rotate(-90 40 40)" />
                      {/* Referidos 28% */}
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#3b82f6" strokeWidth="8"
                        strokeDasharray="52.78 135.82" strokeDashoffset="-65.03"
                        transform="rotate(-90 40 40)" />
                      {/* Google 18% */}
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#10b981" strokeWidth="8"
                        strokeDasharray="33.93 154.67" strokeDashoffset="-117.81"
                        transform="rotate(-90 40 40)" />
                      {/* TikTok 12% */}
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#f59e0b" strokeWidth="8"
                        strokeDasharray="22.62 166" strokeDashoffset="-151.74"
                        transform="rotate(-90 40 40)" />
                      {/* Otros 8% */}
                      <circle cx="40" cy="40" r="30" fill="none" stroke="#94a3b8" strokeWidth="8"
                        strokeDasharray="15.08 173.52" strokeDashoffset="-174.36"
                        transform="rotate(-90 40 40)" />
                      <text x="40" y="38" fontSize="8" fontWeight="bold" fill="#1e293b" textAnchor="middle">142</text>
                      <text x="40" y="46" fontSize="4.5" fill="#64748b" textAnchor="middle">pacientes</text>
                    </svg>
                    <div className="space-y-1 flex-1">
                      {[
                        { label: "Instagram", pct: "34%", color: "bg-violet-500" },
                        { label: "Referidos", pct: "28%", color: "bg-blue-500" },
                        { label: "Google", pct: "18%", color: "bg-emerald-500" },
                        { label: "TikTok", pct: "12%", color: "bg-amber-500" },
                        { label: "Otros", pct: "8%", color: "bg-slate-400" },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 text-[9px]">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.color}`} />
                          <span className="text-slate-600 flex-1">{s.label}</span>
                          <span className="font-bold text-slate-800">{s.pct}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card — Pending collections (top-right) */}
          <div
            className="hidden lg:block absolute -top-6 -right-52 w-56 rotate-2 z-20 hero-float-card"
            style={{ ["--float-delay" as string]: "0.6s" }}
          >
            <div className="rounded-xl border border-red-200 bg-white shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-red-500 to-rose-500 px-3 py-2 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                  Pendiente de cobro
                </span>
              </div>
              <div className="p-3">
                <p className="text-2xl font-extrabold text-red-600">S/. 3,350</p>
                <p className="text-[10px] text-slate-500 mt-0.5">acumulado de 8 pacientes</p>
                <div className="mt-2 space-y-1.5">
                  {[
                    { name: "María López", amount: "S/. 850" },
                    { name: "Carlos Ríos", amount: "S/. 620" },
                    { name: "Ana Mendoza", amount: "S/. 480" },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-600">{p.name}</span>
                      <span className="font-bold text-red-600">{p.amount}</span>
                    </div>
                  ))}
                  <p className="text-[9px] text-slate-400 italic text-right">+5 más...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card — Demographics donut (bottom-left) */}
          <div
            className="hidden lg:block absolute -bottom-10 -left-52 w-56 -rotate-3 z-20 hero-float-card"
            style={{ ["--float-delay" as string]: "1.1s" }}
          >
            <div className="rounded-xl border border-blue-200 bg-white shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                  Demografía
                </span>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 80 80" className="w-16 h-16 shrink-0">
                    {/* Lima 75% */}
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#3b82f6" strokeWidth="10"
                      strokeDasharray="131.95 44.65" strokeDashoffset="0"
                      transform="rotate(-90 40 40)" />
                    {/* Arequipa 9% */}
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#8b5cf6" strokeWidth="10"
                      strokeDasharray="15.83 160.77" strokeDashoffset="-131.95"
                      transform="rotate(-90 40 40)" />
                    {/* Cusco 6% */}
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#f59e0b" strokeWidth="10"
                      strokeDasharray="10.56 166.04" strokeDashoffset="-147.78"
                      transform="rotate(-90 40 40)" />
                    {/* Otros 10% */}
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#94a3b8" strokeWidth="10"
                      strokeDasharray="17.59 159.01" strokeDashoffset="-158.34"
                      transform="rotate(-90 40 40)" />
                    <text x="40" y="38" fontSize="9" fontWeight="bold" fill="#1e293b" textAnchor="middle">75%</text>
                    <text x="40" y="46" fontSize="4.5" fill="#64748b" textAnchor="middle">Lima</text>
                  </svg>
                  <div className="space-y-1 flex-1">
                    {[
                      { label: "Lima", pct: "75%", color: "bg-blue-500" },
                      { label: "Arequipa", pct: "9%", color: "bg-violet-500" },
                      { label: "Cusco", pct: "6%", color: "bg-amber-500" },
                      { label: "Otros", pct: "10%", color: "bg-slate-400" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center gap-1.5 text-[9px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${r.color}`} />
                        <span className="text-slate-600 flex-1">{r.label}</span>
                        <span className="font-bold text-slate-800">{r.pct}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card — Billing by doctor (bottom-right) */}
          <div
            className="hidden lg:block absolute -bottom-12 -right-48 w-60 rotate-3 z-20 hero-float-card"
            style={{ ["--float-delay" as string]: "1.6s" }}
          >
            <div className="rounded-xl border border-emerald-200 bg-white shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                  Facturación por doctor
                </span>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { name: "Dra. Angela Quispe", amount: "S/. 8,420", pct: 100 },
                  { name: "Dr. Renzo Mendoza", amount: "S/. 5,680", pct: 67 },
                  { name: "Dra. Lucía Paredes", amount: "S/. 4,350", pct: 52 },
                ].map((doc) => (
                  <div key={doc.name}>
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-slate-700 font-medium truncate">{doc.name}</span>
                      <span className="font-bold text-emerald-700 ml-2 shrink-0">{doc.amount}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{ width: `${doc.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 font-semibold">Total mes</span>
                  <span className="font-extrabold text-slate-900">S/. 18,450</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="py-20 px-4 md:px-6 bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Si no mides,
            <span className="text-orange-400"> no mejoras.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">
            El 73% de los médicos no saben cuánto facturaron el mes pasado hasta que
            revisan su cuenta bancaria. El 85% no sabe cuántos pacientes no regresaron.
            Estás volando a ciegas.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { stat: "73%", label: "de doctores", desc: "no saben cuánto facturaron hasta fin de mes (o después)" },
              { stat: "S/. 3,200", label: "promedio", desc: "en deudas no cobradas que un consultorio acumula sin saberlo" },
              { stat: "0 datos", label: "de marketing", desc: "la mayoría no sabe de dónde vienen sus pacientes nuevos" },
            ].map((item, idx) => (
              <Reveal key={idx} delay={idx * 120} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                <p className="text-4xl font-extrabold text-orange-400">{item.stat}</p>
                <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4 REPORT AREAS */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              4 reportes que cambian
              <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent"> cómo ves tu negocio.</span>
            </h2>
          </div>

          <div className="space-y-16">
            {/* Financiero */}
            <Reveal className="grid gap-10 md:grid-cols-2 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 mb-4">
                  <DollarSign className="h-3.5 w-3.5" /> Reporte Financiero
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">¿Cuánto ganas realmente?</h3>
                <p className="text-base text-slate-600 mb-5 leading-relaxed">
                  Ingresos vs meta mensual. Cobrado vs pendiente. Por doctor, por servicio, por período.
                  Visualiza el flujo real de tu dinero sin necesidad de Excel.
                </p>
                <ul className="space-y-2">
                  {["Ingresos brutos vs cobrados vs pendientes", "Desglose por doctor y por servicio", "Meta mensual con barra de progreso", "Exportable a CSV para tu contador"].map((i, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />{i}</li>
                  ))}
                </ul>
              </div>
              <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <div className="text-center"><DollarSign className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Captura: Reporte financiero</p></div>
              </div>
            </Reveal>

            {/* Retención */}
            <Reveal className="grid gap-10 md:grid-cols-2 items-center">
              <div className="order-2 md:order-1 aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <div className="text-center"><HeartPulse className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Captura: Dashboard retención</p></div>
              </div>
              <div className="order-1 md:order-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 mb-4">
                  <HeartPulse className="h-3.5 w-3.5" /> Retención de Pacientes
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">¿Quién no regresó... y cuánto vale?</h3>
                <p className="text-base text-slate-600 mb-5 leading-relaxed">
                  Lifetime value por paciente. Tasa de retorno. Pacientes en riesgo de abandono.
                  Identifica quién vale la pena recuperar y actúa antes de perderlo.
                </p>
                <ul className="space-y-2">
                  {["LTV (Lifetime Value) por paciente", "Tasa de retorno mensual y trimestral", "Lista de pacientes en riesgo (90+ días sin cita)", "Emails automáticos de reactivación"].map((i, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />{i}</li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Marketing */}
            <Reveal className="grid gap-10 md:grid-cols-2 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 mb-4">
                  <TrendingUp className="h-3.5 w-3.5" /> Reporte de Marketing
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">¿De dónde vienen tus pacientes?</h3>
                <p className="text-base text-slate-600 mb-5 leading-relaxed">
                  Instagram, TikTok, Google, referidos, booking online. Sabe exactamente qué canal
                  te trae más pacientes, cuáles generan más ingresos, y de qué zonas geográficas vienen.
                </p>
                <ul className="space-y-2">
                  {["Distribución por origen (red social, referido, booking)", "Demografía: departamento y distrito", "Pacientes nuevos vs recurrentes por período", "ROI por canal de adquisición"].map((i, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />{i}</li>
                  ))}
                </ul>
              </div>
              <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <div className="text-center"><PieChart className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Captura: Origen de pacientes</p></div>
              </div>
            </Reveal>

            {/* Cobros */}
            <Reveal className="grid gap-10 md:grid-cols-2 items-center">
              <div className="order-2 md:order-1 aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <div className="text-center"><Wallet className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Captura: Control de cobros</p></div>
              </div>
              <div className="order-1 md:order-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-4">
                  <Wallet className="h-3.5 w-3.5" /> Cobros y Pagos
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">¿Quién te debe... y desde cuándo?</h3>
                <p className="text-base text-slate-600 mb-5 leading-relaxed">
                  Registra pagos por cita (efectivo, tarjeta, Yape, Plin). Visualiza saldos pendientes,
                  deuda por paciente y envía recibos automáticos. No más &ldquo;me olvidé de cobrar&rdquo;.
                </p>
                <ul className="space-y-2">
                  {["Múltiples métodos de pago (efectivo, Yape, tarjeta, Plin)", "Badge de deuda visible en cada cita del calendario", "Recibos y facturas enviados automáticamente", "Deuda total por paciente en su ficha"].map((i, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />{i}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-8 md:p-12 text-center shadow-sm">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Antes cerraba el mes sin saber si fue bueno o malo hasta que miraba mi cuenta.
              Ahora abro el dashboard y en 5 segundos sé: cuánto facturé, quién me debe,
              y qué pacientes están a punto de irse. Eso cambió cómo tomo decisiones.&rdquo;
            </blockquote>
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-900">Nombre del doctor</p>
              <p className="text-xs text-slate-500">Especialidad — Ciudad, País</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-4 md:px-6 bg-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <BarChart3 className="h-10 w-10 text-orange-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Lo que no mides
            <br /><span className="text-orange-400">no lo puedes mejorar.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">14 días gratis. Sin tarjeta de crédito.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">Empezar prueba gratis <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/producto" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all w-full sm:w-auto">Ver todas las funciones</Link>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "REPLACE — Reportes para Clínica Médica", applicationCategory: "MedicalApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" } }) }} />
    </div>
  );
}
