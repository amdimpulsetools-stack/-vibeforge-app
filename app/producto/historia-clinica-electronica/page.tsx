import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  ArrowRight,
  ChevronRight,
  FileText,
  Shield,
  Pill,
  FlaskConical,
  LayoutTemplate,
  Lock,
  CheckCircle2,
  Stethoscope,
  Heart,
  Search,
  Printer,
  History,
  Brain,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Historia Clínica Electrónica — SOAP, Recetas, Exámenes | REPLACE",
  description:
    "Historia clínica electrónica con notas SOAP, diagnósticos CIE-10, recetas digitales imprimibles, órdenes de exámenes de laboratorio e imagenología, firma digital y plantillas reutilizables.",
  keywords: [
    "historia clínica electrónica", "HCE", "expediente clínico electrónico",
    "notas SOAP", "receta médica digital", "orden de exámenes médicos",
    "CIE-10", "firma digital médica",
  ],
  openGraph: {
    title: "Historia Clínica Electrónica | REPLACE",
    description: "Todo el expediente de tu paciente en un solo lugar. Digital, seguro y siempre accesible.",
  },
  alternates: { canonical: "/producto/historia-clinica-electronica" },
};

export default function HistoriaClinicaPage() {
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
          <span className="text-slate-900 font-medium">Historia Clínica Electrónica</span>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════ */}
      {/* HERO                                            */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-6">
            <FileText className="h-3.5 w-3.5" />
            HCE + Recetas + Exámenes
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            El expediente que
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
              nunca se pierde.
            </span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Cada nota clínica, cada receta, cada orden de examen — todo en un solo lugar.
            Accesible desde cualquier dispositivo. Firmado digitalmente.
            <strong className="text-slate-900"> Legalmente válido.</strong>
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto"
            >
              Probar gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">
              Ver planes
            </Link>
          </div>
        </div>

        {/* SOAP Note mockup */}
        <div className="mt-16 mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 bg-slate-50">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-bold text-slate-900">Nota Clínica (SOAP)</span>
              <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Lock className="h-3 w-3" />
                Firmada
              </span>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { letter: "S", label: "Subjetivo", color: "bg-blue-500", text: "Paciente refiere dolor abdominal en zona baja desde hace 3 días..." },
                { letter: "O", label: "Objetivo", color: "bg-emerald-500", text: "PA: 120/80, FC: 72. Abdomen blando, doloroso a la palpación..." },
                { letter: "A", label: "Evaluación", color: "bg-amber-500", text: "M54.2 — Cervicalgia. Posible causa tensional por estrés laboral." },
                { letter: "P", label: "Plan", color: "bg-purple-500", text: "Ibuprofeno 400mg c/8h x 5 días. Ecografía abdominal. Control en 1 sem." },
              ].map((s) => (
                <div key={s.letter} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${s.color}`}>{s.letter}</span>
                    <span className="text-xs font-semibold text-slate-700">{s.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><Search className="h-3 w-3" /> M54.2 — Cervicalgia</span>
              <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> PA: 120/80 | FC: 72</span>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* THE PROBLEM                                     */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            El papel se pierde.
            <span className="text-red-400"> El paciente no.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Carpetas apiladas en un armario. Notas ilegibles. Recetas que el paciente pierde.
            Resultados de laboratorio que nadie puede encontrar.
            ¿Así quieres que funcione tu práctica médica?
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { stat: "40%", label: "de médicos", desc: "no pueden acceder al historial completo del paciente en la consulta" },
              { stat: "15 min", label: "por paciente", desc: "se pierden buscando notas antiguas en carpetas o archivos desordenados" },
              { stat: "1 de 3", label: "recetas", desc: "se pierden antes de que el paciente llegue a la farmacia" },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                <p className="text-4xl font-extrabold text-blue-400">{item.stat}</p>
                <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* 3 SUB-FEATURES                                  */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Tres herramientas.
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent"> Un solo expediente.</span>
            </h2>
          </div>

          {/* Sub-feature 1: Notas SOAP */}
          <div className="grid gap-12 md:grid-cols-2 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-4">
                <FileText className="h-3.5 w-3.5" />
                Notas Clínicas SOAP
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                Documenta en 2 minutos lo que antes tomaba 10
              </h3>
              <p className="text-base text-slate-600 mb-6 leading-relaxed">
                Formato SOAP estructurado con autocompletado de diagnósticos CIE-10,
                signos vitales con gráficas de tendencia, plantillas reutilizables por
                especialidad y firma digital con versionado automático.
              </p>
              <ul className="space-y-3">
                {[
                  "Subjetivo, Objetivo, Análisis y Plan en un solo formulario",
                  "Autocompletado de diagnósticos CIE-10 mientras escribes",
                  "Signos vitales con gráficas de tendencia por paciente",
                  "Firma digital — una vez firmada, la nota queda inalterable",
                  "Historial de versiones para auditoría médico-legal",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Captura: Nota SOAP</p>
              </div>
            </div>
          </div>

          {/* Sub-feature 2: Recetas */}
          <div className="grid gap-12 md:grid-cols-2 items-center mb-20">
            <div className="order-2 md:order-1 aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <Pill className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Captura: Receta impresa</p>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 mb-4">
                <Pill className="h-3.5 w-3.5" />
                Recetas Médicas Digitales
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                Recetas que no se pierden y siempre se leen
              </h3>
              <p className="text-base text-slate-600 mb-6 leading-relaxed">
                Crea prescripciones con dosis, vía, frecuencia y duración.
                Imprime en formato A5 profesional o envía por email.
                El historial completo queda vinculado al paciente — siempre.
              </p>
              <ul className="space-y-3">
                {[
                  "Medicamento, dosis, vía, frecuencia, duración, cantidad",
                  "Impresión profesional A5 con firma y datos del doctor",
                  "Historial completo de prescripciones por paciente",
                  "Suspender/reactivar prescripciones para seguridad",
                  "Envío automático por email al paciente",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sub-feature 3: Exámenes */}
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 mb-4">
                <FlaskConical className="h-3.5 w-3.5" />
                Órdenes de Exámenes
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                Del diagnóstico al laboratorio en 30 segundos
              </h3>
              <p className="text-base text-slate-600 mb-6 leading-relaxed">
                Catálogo personalizable por categoría (laboratorio, imagenología, cardiología).
                El doctor selecciona exámenes, agrega indicaciones, imprime la orden.
                El seguimiento de resultados queda en la ficha del paciente.
              </p>
              <ul className="space-y-3">
                {[
                  "Catálogo configurable por el administrador de la clínica",
                  "Selección múltiple con indicaciones específicas (ej: en ayunas)",
                  "Diagnóstico presuntivo con código CIE-10 en la orden",
                  "Seguimiento: pendiente → parcial → completado",
                  "Impresión profesional con firma del médico",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <FlaskConical className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Captura: Orden de exámenes</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* EXTRAS: Templates + Security                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: LayoutTemplate,
                title: "Plantillas reutilizables",
                desc: "Crea plantillas SOAP por tipo de consulta. Aplica en 1 click y personaliza. Compártelas con tu equipo médico.",
              },
              {
                icon: Shield,
                title: "Seguridad médico-legal",
                desc: "Firma digital, versionado automático, sin posibilidad de eliminar notas firmadas. Cumple con normativas de registros médicos.",
              },
              {
                icon: History,
                title: "Todo en un timeline",
                desc: "Cada nota, receta y orden queda vinculada al paciente en un historial cronológico. Nada se pierde. Todo es rastreable.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 mb-4">
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
      {/* TESTIMONIAL                                     */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-8 md:p-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Antes mis notas eran ilegibles hasta para mí.
              Ahora cada paciente tiene un expediente completo que puedo revisar
              desde mi celular antes de que entre al consultorio.
              Las recetas se imprimen perfectas y los exámenes los rastreo uno por uno.&rdquo;
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
          <FileText className="h-10 w-10 text-blue-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Un paciente sin historial completo
            <br />
            <span className="text-blue-400">es un riesgo clínico.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">
            Digitaliza tu práctica hoy. Cada nota, receta y examen quedará seguro para siempre.
            14 días gratis. Sin tarjeta de crédito.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
              Empezar prueba gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/producto" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all w-full sm:w-auto">
              Ver todas las funciones
            </Link>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "REPLACE — Historia Clínica Electrónica",
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            description: "Historia clínica electrónica con notas SOAP, recetas digitales, órdenes de exámenes y firma digital.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" },
          }),
        }}
      />
    </div>
  );
}
