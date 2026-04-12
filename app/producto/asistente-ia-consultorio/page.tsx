import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  ArrowRight,
  ChevronRight,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  CalendarDays,
  MessageCircle,
  BarChart3,
  Clock,
  Zap,
  Brain,
  Target,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Asistente IA para Consultorio Médico — Toma Decisiones con Datos | REPLACE",
  description:
    "Tu clínica genera datos todos los días. El asistente IA de REPLACE los convierte en decisiones inteligentes: pregúntale en español sobre tus ingresos, pacientes, ocupación y más.",
  keywords: [
    "asistente IA consultorio médico",
    "inteligencia artificial clínica",
    "IA para médicos",
    "analytics clínica IA",
    "software médico inteligencia artificial",
    "chatbot médico",
  ],
  openGraph: {
    title: "Asistente IA para Consultorio Médico | REPLACE",
    description: "Pregúntale a tu clínica. Ella te responde.",
    type: "website",
  },
  alternates: { canonical: "/producto/asistente-ia-consultorio" },
};

// Chat examples that show real value
const CHAT_EXAMPLES = [
  {
    question: "¿Cuánto facturé este mes comparado con el anterior?",
    answer:
      "Este mes llevas S/. 18,450 facturados (87% cobrado). El mes pasado cerraste en S/. 15,200. Vas un 21% arriba. Tu mejor día fue el martes 8 con S/. 2,100 en 6 consultas.",
    icon: DollarSign,
    color: "emerald",
  },
  {
    question: "¿Qué pacientes no han vuelto en más de 3 meses?",
    answer:
      "Encontré 23 pacientes que no tienen cita desde hace 90+ días. Los 5 con mayor valor histórico son: María López (S/. 2,400), Carlos Ríos (S/. 1,800), Ana Mendoza (S/. 1,650)... ¿Quieres que te muestre la lista completa?",
    icon: Users,
    color: "blue",
  },
  {
    question: "¿Cuál es mi tasa de no-show esta semana?",
    answer:
      "Esta semana tuviste 3 inasistencias de 42 citas programadas (7.1%). Es menor que tu promedio de 12%. Los lunes tienen la tasa más alta (15%). Recomendación: refuerza los recordatorios de domingo por la tarde.",
    icon: CalendarDays,
    color: "amber",
  },
  {
    question: "¿De dónde vienen mis pacientes nuevos?",
    answer:
      "En los últimos 30 días: Instagram (34%), Referidos (28%), Google (18%), TikTok (12%), Otros (8%). Instagram creció un 45% respecto al mes anterior. Los pacientes de referidos tienen el ticket promedio más alto: S/. 185.",
    icon: TrendingUp,
    color: "violet",
  },
];

// Before/After comparisons
const BEFORE_AFTER = [
  {
    before: "Revisas Excel 2 horas al fin de mes para saber cuánto facturaste",
    after: 'Le preguntas "¿cómo voy este mes?" y tienes la respuesta en 3 segundos',
    metric: "2 horas → 3 segundos",
  },
  {
    before: "No sabes qué pacientes dejaron de venir hasta que es tarde",
    after: "La IA te alerta automáticamente quién está en riesgo de abandono",
    metric: "Reactivo → Proactivo",
  },
  {
    before: "Tomas decisiones de marketing basándote en intuición",
    after: "Sabes exactamente qué canal trae más pacientes y a qué costo",
    metric: "Intuición → Datos",
  },
  {
    before: "No identificas patrones en tu agenda (horas pico, días muertos)",
    after: "La IA te muestra cuándo optimizar y cuándo agregar horarios",
    metric: "Ciego → Visible",
  },
];

export default function AsistenteIAPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Breadcrumb */}
      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-5xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/producto" className="hover:text-emerald-600">Producto</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium">Asistente IA</span>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════ */}
      {/* HERO — The provocative opening                  */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-700 mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Potenciado por Inteligencia Artificial
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
              Tu clínica ya tiene
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-emerald-500 bg-clip-text text-transparent">
                las respuestas.
              </span>
              <br />
              Solo falta preguntar.
            </h1>

            <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Cada cita, cada pago, cada paciente genera información valiosa.
              El problema es que estás demasiado ocupado atendiendo pacientes
              como para analizarla. <strong className="text-slate-900">El asistente IA lo hace por ti.</strong>
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4" />
                Probar asistente IA gratis
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto"
              >
                Ver planes
              </Link>
            </div>
          </div>

          {/* Hero visual — AI chat mockup */}
          <div className="mt-16 mx-auto max-w-2xl">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-xl overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Asistente IA</p>
                  <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    En línea
                  </p>
                </div>
              </div>

              {/* Chat messages */}
              <div className="p-5 space-y-4">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2.5 text-sm text-white shadow-sm">
                    ¿Cómo va mi clínica este mes?
                  </div>
                </div>

                {/* AI response */}
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm border border-slate-100">
                    <p className="font-medium text-slate-900 mb-2">Aquí tienes tu resumen de abril:</p>
                    <div className="space-y-1.5 text-xs">
                      <p className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-600">
                          <DollarSign className="h-3 w-3" />
                        </span>
                        <span><strong>S/. 18,450</strong> facturados (87% cobrado)</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-600">
                          <Users className="h-3 w-3" />
                        </span>
                        <span><strong>142 citas</strong> completadas, 12 nuevos pacientes</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-600">
                          <TrendingUp className="h-3 w-3" />
                        </span>
                        <span><strong>+21%</strong> vs mes anterior</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-600">
                          <Target className="h-3 w-3" />
                        </span>
                        <span><strong>23 pacientes</strong> no han vuelto en 90+ días</span>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 italic">
                      Tu mejor servicio este mes: Consulta ginecológica (38% de ingresos)
                    </p>
                  </div>
                </div>
              </div>

              {/* Input bar */}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5">
                  <MessageCircle className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Pregunta lo que quieras sobre tu clínica...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* THE PROBLEM — Pain point section                */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Tu clínica genera datos
            <span className="text-emerald-400"> todos los días.</span>
            <br />
            Pero tú no tienes tiempo de leerlos.
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Mientras atiendes pacientes, tu sistema acumula información que podría
            ayudarte a facturar más, retener pacientes y optimizar tu agenda.
            El problema no es la falta de datos — es la falta de tiempo para analizarlos.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                stat: "73%",
                label: "de los médicos",
                desc: "toman decisiones de negocio basándose solo en intuición",
              },
              {
                stat: "2h",
                label: "cada semana",
                desc: "se pierden revisando Excel o cuadernos para sacar reportes",
              },
              {
                stat: "35%",
                label: "de pacientes",
                desc: "no regresan después de la primera consulta (y nadie lo nota)",
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                <p className="text-4xl font-extrabold text-emerald-400">{item.stat}</p>
                <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* THE SOLUTION — Chat examples                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Pregunta en español.
              <br />
              <span className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-transparent">
                Recibe respuestas con datos reales.
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Sin dashboards complicados. Sin filtros. Sin exportar a Excel.
              Solo escribe tu pregunta como si hablaras con un colega.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {CHAT_EXAMPLES.map((example, idx) => {
              const Icon = example.icon;
              const colorMap: Record<string, string> = {
                emerald: "bg-emerald-100 text-emerald-600 border-emerald-200",
                blue: "bg-blue-100 text-blue-600 border-blue-200",
                amber: "bg-amber-100 text-amber-600 border-amber-200",
                violet: "bg-violet-100 text-violet-600 border-violet-200",
              };
              const borderMap: Record<string, string> = {
                emerald: "border-emerald-200 hover:border-emerald-300",
                blue: "border-blue-200 hover:border-blue-300",
                amber: "border-amber-200 hover:border-amber-300",
                violet: "border-violet-200 hover:border-violet-300",
              };

              return (
                <div
                  key={idx}
                  className={`rounded-2xl border bg-white p-6 hover:shadow-lg transition-all ${borderMap[example.color]}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${colorMap[example.color]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  {/* Question */}
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Tú preguntas:
                    </p>
                    <p className="text-base font-bold text-slate-900 leading-snug">
                      &ldquo;{example.question}&rdquo;
                    </p>
                  </div>

                  {/* Answer */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-500 mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      IA responde:
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {example.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* BEFORE / AFTER                                  */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Sin IA vs. Con IA
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              La diferencia entre adivinar y saber.
            </p>
          </div>

          <div className="space-y-4">
            {BEFORE_AFTER.map((item, idx) => (
              <div
                key={idx}
                className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-center rounded-2xl border border-slate-200 bg-white p-5 md:p-6"
              >
                {/* Before */}
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-500 mt-0.5">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-0.5">Sin IA</p>
                    <p className="text-sm text-slate-700">{item.before}</p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="hidden md:flex flex-col items-center">
                  <ArrowRight className="h-5 w-5 text-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-600 mt-1 whitespace-nowrap">{item.metric}</span>
                </div>
                <div className="md:hidden flex items-center gap-2 pl-11">
                  <ArrowRight className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600">{item.metric}</span>
                </div>

                {/* After */}
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 mt-0.5">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Con IA</p>
                    <p className="text-sm text-slate-700">{item.after}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Cómo funciona
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Tres pasos. Cero configuración.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: MessageCircle,
                title: "Pregunta lo que quieras",
                desc: "Escribe en español natural: sobre ingresos, pacientes, ocupación, tendencias o cualquier dato de tu clínica.",
              },
              {
                step: "02",
                icon: Brain,
                title: "La IA analiza tus datos",
                desc: "Consulta automáticamente tu base de datos (citas, pagos, pacientes) y procesa la información en tiempo real.",
              },
              {
                step: "03",
                icon: BarChart3,
                title: "Recibe insights accionables",
                desc: "No solo números — recibes contexto, comparaciones y recomendaciones concretas para tu práctica.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 border border-violet-200 mb-4">
                    <Icon className="h-7 w-7 text-violet-600" />
                  </div>
                  <div className="text-xs font-bold text-violet-500 mb-2">PASO {item.step}</div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* TRUST — Technology + Privacy                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              IA de confianza para datos sensibles
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Tus datos, solo tuyos",
                desc: "La IA analiza datos en tiempo real. No almacena conversaciones ni comparte información entre clínicas.",
              },
              {
                icon: Zap,
                title: "Potenciado por Claude (Anthropic)",
                desc: "Usamos el modelo de IA más seguro y preciso del mercado. Diseñado para ser honesto y confiable.",
              },
              {
                icon: Brain,
                title: "Contexto médico",
                desc: "Entiende terminología clínica, CIE-10, flujos de consultorio y métricas relevantes para tu práctica.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* TESTIMONIAL placeholder                         */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 p-8 md:p-12 text-center">
            {/* Placeholder avatar */}
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Antes cerraba el mes sin saber realmente cuánto gané.
              Ahora le pregunto a la IA y en 5 segundos tengo todo:
              ingresos, pacientes nuevos, deudas pendientes.
              Es como tener un contador y un analista trabajando gratis.&rdquo;
            </blockquote>
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-900">Nombre del doctor</p>
              <p className="text-xs text-slate-500">Especialidad — Ciudad, País</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* FINAL CTA                                       */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <Sparkles className="h-10 w-10 text-violet-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Las decisiones que
            <span className="text-emerald-400"> no estás tomando</span>
            <br />
            le cuestan dinero a tu clínica.
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">
            Empieza a tomar decisiones basadas en datos hoy.
            14 días gratis. Sin tarjeta de crédito. Sin compromisos.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Empezar prueba gratis
            </Link>
            <Link
              href="/producto"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all w-full sm:w-auto"
            >
              Ver todas las funciones
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "REPLACE — Asistente IA para Consultorio Médico",
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            description: "Asistente de inteligencia artificial para clínicas médicas. Pregúntale sobre ingresos, pacientes, ocupación y tendencias en lenguaje natural.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Inicio", item: "https://REPLACE.com/" },
              { "@type": "ListItem", position: 2, name: "Producto", item: "https://REPLACE.com/producto" },
              { "@type": "ListItem", position: 3, name: "Asistente IA", item: "https://REPLACE.com/producto/asistente-ia-consultorio" },
            ],
          }),
        }}
      />
    </div>
  );
}
