import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  ArrowRight,
  ChevronRight,
  Users,
  UserCheck,
  Heart,
  ClipboardList,
  FileText,
  Paperclip,
  Flag,
  Tags,
  Search,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  UserX,
  Clock,
  BarChart3,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Gestión de Pacientes Médicos — Expedientes y Seguimientos | REPLACE",
  description:
    "Gestiona pacientes con fichas completas, historial médico unificado, planes de tratamiento multi-sesión, seguimientos clínicos con prioridad y adjuntos. Software para consultorios.",
  keywords: [
    "gestión de pacientes", "expediente del paciente", "ficha de paciente médico",
    "seguimiento clínico", "tratamiento multi-sesión", "software gestión pacientes",
  ],
  openGraph: {
    title: "Gestión de Pacientes Médicos | REPLACE",
    description: "Conoce a cada paciente como si fuera el único.",
  },
  alternates: { canonical: "/producto/gestion-pacientes" },
};

export default function GestionPacientesPage() {
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
          <span className="text-slate-900 font-medium">Gestión de Pacientes</span>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════ */}
      {/* HERO                                            */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-700 mb-6">
            <Users className="h-3.5 w-3.5" />
            Expediente + Seguimiento + Tratamientos
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            Conoce a cada paciente
            <br />
            <span className="bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">
              como si fuera el único.
            </span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            500 pacientes. 500 historias diferentes.
            Pero tú los recuerdas a todos — porque su expediente completo
            está a <strong className="text-slate-900">2 clics de distancia.</strong>
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
              Probar gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">
              Ver planes
            </Link>
          </div>
        </div>

        {/* Patient card mockup */}
        <div className="mt-16 mx-auto max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="bg-teal-600 px-5 py-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
                ML
              </div>
              <div>
                <p className="text-white font-bold">María López Gutiérrez</p>
                <p className="text-teal-200 text-xs">DNI: 45678912 · 34 años · Lima, San Borja</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold text-teal-600">24</p>
                  <p className="text-[10px] text-slate-500">Citas totales</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold text-emerald-600">S/. 2,400</p>
                  <p className="text-[10px] text-slate-500">Valor total</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-lg font-bold text-blue-600">3</p>
                  <p className="text-[10px] text-slate-500">Tratamientos</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Ginecología", "SOP", "Control mensual", "Seguro EPS"].map((tag) => (
                  <span key={tag} className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-medium text-teal-700">{tag}</span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                Última cita: 15 mar 2026 — Dra. Angela Quispe
              </div>
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
            Los pacientes que no sigues
            <span className="text-amber-400"> se van con otro doctor.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            No es que te dejan porque eres mal médico.
            Te dejan porque nadie los llamó para su control.
            Porque nadie notó que no regresaron.
            Porque su expediente estaba en un cajón.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: UserX, stat: "35%", label: "de pacientes", desc: "no regresan después de la primera consulta si no hay seguimiento" },
              { icon: AlertTriangle, stat: "S/. 12,000", label: "al año", desc: "pierde un consultorio promedio por pacientes que no retienen" },
              { icon: Clock, stat: "90 días", label: "sin contacto", desc: "y el paciente ya encontró a alguien más (o dejó de tratarse)" },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                  <Icon className="h-6 w-6 text-amber-400 mx-auto mb-3" />
                  <p className="text-4xl font-extrabold text-amber-400">{item.stat}</p>
                  <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                  <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* FEATURES                                        */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Un expediente que
              <span className="bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent"> trabaja contigo.</span>
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                icon: FileText,
                title: "Ficha completa del paciente",
                desc: "DNI, fecha de nacimiento, teléfono, email, departamento, distrito, origen, nacionalidad, campos personalizables. Todo lo que necesitas para conocer a tu paciente.",
                color: "teal",
              },
              {
                icon: ClipboardList,
                title: "Planes de tratamiento multi-sesión",
                desc: "Ortodoncia (24 sesiones), fisioterapia (12 sesiones), control de fertilidad. Crea planes con sesiones, estados y progreso visual por paciente.",
                color: "blue",
              },
              {
                icon: Flag,
                title: "Seguimientos clínicos",
                desc: "Sistema de semáforo: rojo (urgente), amarillo (moderado), verde (rutina). No más pacientes olvidados. El equipo sabe a quién llamar hoy.",
                color: "amber",
              },
              {
                icon: Paperclip,
                title: "Adjuntos y documentos",
                desc: "Sube resultados de laboratorio, imágenes, consentimientos, referidos. Categorizados y siempre vinculados al paciente correcto.",
                color: "violet",
              },
              {
                icon: Tags,
                title: "Etiquetas personalizables",
                desc: "Clasifica pacientes con tags: 'Seguro EPS', 'VIP', 'Control mensual', 'Alergia penicilina'. Filtra y segmenta al instante.",
                color: "pink",
              },
              {
                icon: Search,
                title: "Búsqueda inteligente",
                desc: "Encuentra cualquier paciente por nombre, DNI, teléfono o email en milisegundos. Filtros por estado, origen, fecha y etiquetas.",
                color: "emerald",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              const colorMap: Record<string, string> = {
                teal: "bg-teal-100 text-teal-600 border-teal-200",
                blue: "bg-blue-100 text-blue-600 border-blue-200",
                amber: "bg-amber-100 text-amber-600 border-amber-200",
                violet: "bg-violet-100 text-violet-600 border-violet-200",
                pink: "bg-pink-100 text-pink-600 border-pink-200",
                emerald: "bg-emerald-100 text-emerald-600 border-emerald-200",
              };

              return (
                <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg transition-shadow">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${colorMap[feature.color]} mb-4`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* THE JOURNEY — Patient lifecycle                  */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              El viaje del paciente — de principio a fin
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              REPLACE te acompaña en cada etapa de la relación con tu paciente.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { step: "01", title: "Llega por primera vez", desc: "Se registra (manual o reserva online). Recibe email de bienvenida automático. Su ficha se crea con todos sus datos.", icon: UserCheck, color: "emerald" },
              { step: "02", title: "Primera consulta", desc: "El doctor documenta la nota SOAP, crea recetas, solicita exámenes. Todo queda vinculado a su expediente.", icon: FileText, color: "blue" },
              { step: "03", title: "Seguimiento activo", desc: "Semáforo de seguimientos: quién necesita control, quién tiene resultados pendientes, quién no ha pagado.", icon: Flag, color: "amber" },
              { step: "04", title: "Tratamiento multi-sesión", desc: "Si necesita varias sesiones (fisio, ortodoncia, control), el plan de tratamiento registra el progreso sesión por sesión.", icon: ClipboardList, color: "violet" },
              { step: "05", title: "Retención automática", desc: "Si no vuelve en 90 días, recibe un email de seguimiento automático. En su cumpleaños, recibe un saludo. Nunca se siente abandonado.", icon: Heart, color: "pink" },
            ].map((item) => {
              const Icon = item.icon;
              const colorMap: Record<string, string> = {
                emerald: "bg-emerald-100 text-emerald-600",
                blue: "bg-blue-100 text-blue-600",
                amber: "bg-amber-100 text-amber-600",
                violet: "bg-violet-100 text-violet-600",
                pink: "bg-pink-100 text-pink-600",
              };

              return (
                <div key={item.step} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorMap[item.color]}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-400">PASO {item.step}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
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
          <div className="rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 p-8 md:p-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Tengo 400 pacientes activos y recuerdo el caso de cada uno —
              no porque tenga memoria fotográfica, sino porque su expediente
              me lo dice todo en 5 segundos. El seguimiento automático me ha
              traído de vuelta pacientes que ya daba por perdidos.&rdquo;
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
          <Users className="h-10 w-10 text-teal-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Un paciente olvidado
            <br />
            <span className="text-teal-400">es un paciente perdido.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">
            Empieza a gestionar tus pacientes como lo que son: la base de tu negocio.
            14 días gratis. Sin tarjeta de crédito.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
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
            name: "REPLACE — Gestión de Pacientes Médicos",
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            description: "Gestión completa de pacientes con expedientes, seguimientos clínicos, tratamientos multi-sesión y etiquetas personalizables.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" },
          }),
        }}
      />
    </div>
  );
}
