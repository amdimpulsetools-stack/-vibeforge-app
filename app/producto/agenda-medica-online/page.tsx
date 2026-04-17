import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  ArrowRight,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  Globe,
  Smartphone,
  CheckCircle2,
  X,
  Check,
  AlertTriangle,
  Building2,
  Zap,
  MousePointerClick,
  Ban,
  Bell,
  FileSpreadsheet,
  Table2,
  Trash2,
  RefreshCw,
  Eye,
  BarChart3,
  Brain,
  Rocket,
  CreditCard,
  CircleDollarSign,
  CalendarClock,
  ShieldAlert,
  Plus,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Agenda Médica Online — Citas y Reservas para Consultorios | REPLACE",
  description:
    "Agenda médica online con calendario visual drag-and-drop, múltiples doctores y consultorios, reserva online 24/7 y detección automática de conflictos. Software de citas para clínicas.",
  keywords: [
    "agenda médica online", "sistema de citas médicas", "reserva de citas online",
    "software agenda consultorio", "calendario médico digital", "agenda para clínica",
  ],
  openGraph: {
    title: "Agenda Médica Online — Citas y Reservas | REPLACE",
    description: "Tu agenda llena. Tus pacientes puntuales. Cero conflictos.",
  },
  alternates: { canonical: "/producto/agenda-medica-online" },
};

export default function AgendaMedicaPage() {
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
          <span className="text-slate-900 font-medium">Agenda Médica Online</span>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════ */}
      {/* HERO                                            */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 mb-6">
              <CalendarDays className="h-3.5 w-3.5" />
              Agenda + Reserva Online
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
              Tu agenda llena.
              <br />
              Tus pacientes
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent"> puntuales.</span>
              <br />
              Cero conflictos.
            </h1>

            <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Deja de perseguir pacientes por WhatsApp para confirmar citas.
              Deja de anotar en cuadernos que se pierden.
              <strong className="text-slate-900"> Deja que la agenda trabaje por ti.</strong>
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl gradient-primary px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto"
              >
                Probar agenda gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto"
              >
                Ver planes
              </Link>
            </div>
          </div>

          {/* Calendar visual mockup + floating action cards */}
          <div className="mt-16 mb-16 mx-auto max-w-3xl relative">
            {/* Floating: Conflict alert (top-left) */}
            <div className="hidden lg:block absolute -top-8 -left-20 w-56 rounded-2xl border border-red-200 bg-white shadow-2xl p-4 -rotate-3 z-20">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-red-700">Conflicto detectado</p>
                  <p className="text-[9px] text-red-500">08:30 — Consultorio A</p>
                </div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
                <p className="text-[10px] text-red-800 leading-snug">
                  <span className="font-bold">Dra. García</span> no está disponible a esa hora.
                  Ya tiene una cita con Carlos Ríos.
                </p>
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="rounded-md bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-700">
                  Ver alternativas
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                  Cambiar doctor
                </span>
              </div>
            </div>

            {/* Floating: Partial payment (top-right) */}
            <div className="hidden lg:block absolute -top-6 -right-20 w-56 rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 rotate-2 z-20">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <CreditCard className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-900">Pago parcial</p>
                  <p className="text-[9px] text-slate-500">María López — Consulta</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total</span>
                  <span className="font-bold text-slate-900">S/. 150.00</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Pagado</span>
                  <span className="font-bold text-emerald-600">S/. 80.00</span>
                </div>
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Pendiente</span>
                  <span className="font-bold text-amber-600">S/. 70.00</span>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CreditCard className="h-2.5 w-2.5" /> Yape
                </span>
                <span className="text-[9px] text-slate-400">15 mar 2026</span>
              </div>
            </div>

            {/* Floating: Reschedule button (bottom-left) */}
            <div className="hidden lg:block absolute -bottom-10 -left-16 rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 -rotate-2 z-20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <CalendarClock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Reprogramar cita</p>
                  <p className="text-[10px] text-slate-500">Ana Mendoza · 09:00</p>
                </div>
                <div className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                  Mover a 10:30
                </div>
              </div>
            </div>

            {/* Floating: Add payment button (bottom-right) */}
            <div className="hidden lg:block absolute -bottom-8 -right-14 rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 rotate-3 z-20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <CircleDollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Añadir pago</p>
                  <p className="text-[10px] text-slate-500">Pedro Jiménez · S/. 200</p>
                </div>
                <div className="ml-2 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white">
                  <Plus className="h-3 w-3" /> Registrar
                </div>
              </div>
            </div>

            {/* Main calendar card */}
            <div className="relative z-10 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
              {/* Header bar */}
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-slate-50">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-bold text-slate-900">Jueves, 9 Abril 2026</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">8 citas hoy</span>
                </div>
              </div>

              {/* Mock time slots */}
              <div className="p-4 space-y-2">
                {[
                  { time: "08:00", patient: "María López", doctor: "Dra. García", color: "#10b981", status: "confirmed" },
                  { time: "08:30", patient: "Carlos Ríos", doctor: "Dra. García", color: "#10b981", status: "confirmed" },
                  { time: "09:00", patient: "Ana Mendoza", doctor: "Dr. Pérez", color: "#6366f1", status: "scheduled" },
                  { time: "09:30", patient: "", doctor: "", color: "", status: "free" },
                  { time: "10:00", patient: "Pedro Jiménez", doctor: "Dra. García", color: "#10b981", status: "confirmed" },
                ].map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-12 text-xs font-mono text-slate-400 shrink-0">{slot.time}</span>
                    {slot.status === "free" ? (
                      <div className="flex-1 rounded-lg border border-dashed border-slate-200 py-2.5 px-3 text-xs text-slate-400 italic">
                        Horario disponible
                      </div>
                    ) : (
                      <div
                        className="flex-1 rounded-lg py-2 px-3 text-xs"
                        style={{ backgroundColor: slot.color + "15", borderLeft: `3px solid ${slot.color}` }}
                      >
                        <span className="font-semibold text-slate-900">{slot.patient}</span>
                        <span className="text-slate-500 ml-2">{slot.doctor}</span>
                      </div>
                    )}
                  </div>
                ))}
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
            Cada cita perdida es
            <span className="text-red-400"> dinero que no regresa.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Citas duplicadas. Pacientes que no llegan. Horarios en cuadernos que se pierden.
            Llamadas interminables para confirmar. ¿Te suena familiar?
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Ban, stat: "S/. 4,500", label: "al mes", desc: "pierde un centro médico promedio por inasistencias no gestionadas" },
              { icon: Clock, stat: "4 horas", label: "cada semana", desc: "gasta una recepcionista llamando para confirmar citas" },
              { icon: AlertTriangle, stat: "1 de 4", label: "pacientes", desc: "no se presenta a su cita si no recibe un recordatorio" },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                  <Icon className="h-6 w-6 text-red-400 mx-auto mb-3" />
                  <p className="text-4xl font-extrabold text-red-400">{item.stat}</p>
                  <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                  <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* EXCEL TRAP                                       */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-green-50/60">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-300 bg-green-100 px-4 py-1.5 text-xs font-semibold text-green-800 mb-5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              La trampa del Excel
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              Excel es útil, pero
              <span className="text-green-700"> no te protege.</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Muchos consultorios dan el salto del cuaderno a Excel creyendo que resolvieron el problema.
              La realidad: solo cambiaron un riesgo por otro.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: AlertTriangle,
                title: "Cero detección de conflictos",
                desc: "Puedes agendar dos pacientes a la misma hora sin darte cuenta. Excel no te avisa, tú descubres el error cuando ambos llegan.",
              },
              {
                icon: Eye,
                title: "Visualmente agotador",
                desc: "Celdas diminutas, colores manuales, fórmulas que se rompen. Después de 30 minutos tus ojos se cansan y los errores se multiplican.",
              },
              {
                icon: Table2,
                title: "Decenas de pestañas",
                desc: "Una pestaña por doctor, otra por consultorio, otra por mes. Buscar la cita de un paciente se convierte en un juego de adivinanzas.",
              },
              {
                icon: Trash2,
                title: "Un clic borra todo",
                desc: "Cualquiera puede modificar o borrar una celda por accidente. Sin historial, sin auditoría, sin forma de recuperar lo perdido.",
              },
              {
                icon: RefreshCw,
                title: "Reinventar cada mes",
                desc: "Cada mes creas una hoja nueva, copias formatos, ajustas fechas. Horas de trabajo repetitivo que no aportan valor a tu clínica.",
              },
              {
                icon: BarChart3,
                title: "Sin métricas reales",
                desc: "¿Cuántos no-shows tuviste? ¿Qué doctor tiene más demanda? ¿Qué horario se llena primero? Excel no te responde. Tú tampoco sabes.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-green-200 bg-white p-6 hover:shadow-md transition-shadow">
                  <Icon className="h-6 w-6 text-green-700 mb-3" />
                  <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <p className="text-base font-semibold text-slate-800">
              Excel fue diseñado para hojas de cálculo,{" "}
              <span className="text-emerald-600">no para gestionar la salud de tus pacientes.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* MISSING DATA + MODERN EXPERIENCE                */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Missing patient data */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-violet-100 text-violet-600 border-violet-200 mb-5">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Información que hoy no capturas
                <span className="text-violet-600"> te cuesta pacientes.</span>
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                ¿De dónde vienen tus pacientes? ¿Cuántos son nuevos vs. recurrentes? ¿Qué servicio genera más ingresos?
                Sin estos datos, tus decisiones de marketing son suposiciones.
              </p>
              <ul className="space-y-2.5">
                {[
                  "Fuente de referencia (Instagram, Google, recomendación)",
                  "Historial de visitas y frecuencia de retorno",
                  "Servicios más demandados por perfil de paciente",
                  "Datos demográficos para campañas dirigidas",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500 italic">
                REPLACE captura automáticamente estos datos en cada registro, convirtiendo cada cita en inteligencia para tu negocio.
              </p>
            </div>

            {/* Modern experience */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-emerald-100 text-emerald-600 border-emerald-200 mb-5">
                <Rocket className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Un entorno que
                <span className="text-emerald-600"> acelera todo.</span>
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Interfaz moderna diseñada para fluir, no para aprender manuales.
                Tu equipo la domina en minutos. La velocidad se nota desde el primer día.
              </p>
              <ul className="space-y-2.5">
                {[
                  "3 clics para agendar — no 15 pasos en un formulario eterno",
                  "Búsqueda instantánea de pacientes, doctores y horarios",
                  "Vista adaptable: día, semana o mes según tu flujo",
                  "Funciona en celular, tablet y computadora sin instalar nada",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <Zap className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500 italic">
                Menos clics, menos errores, más pacientes atendidos. Productividad real, no promesas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* FEATURES — 4 pillars                            */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Una agenda que trabaja
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent"> mientras tú atiendes.</span>
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                icon: MousePointerClick,
                title: "Drag & Drop visual",
                desc: "Arrastra y suelta citas como si fuera tu celular. Vista por día, semana o mes. Cambia horarios en 1 segundo sin llamar a nadie.",
                color: "emerald",
              },
              {
                icon: Building2,
                title: "Multi-doctor, multi-consultorio",
                desc: "Cada doctor con su horario. Cada consultorio con su disponibilidad. El sistema detecta conflictos automáticamente — imposible agendar dos citas en el mismo lugar a la misma hora.",
                color: "blue",
              },
              {
                icon: Globe,
                title: "Reserva online 24/7",
                desc: "Un link que compartes por WhatsApp, Instagram o tu web. Tu paciente elige horario, doctor y servicio. La cita aparece en tu agenda automáticamente. Sin llamadas.",
                color: "violet",
              },
              {
                icon: Bell,
                title: "Recordatorios automáticos",
                desc: "24 horas y 2 horas antes, el paciente recibe un recordatorio por WhatsApp y email. Tú no haces nada. La agenda se confirma sola.",
                color: "amber",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              const colorMap: Record<string, string> = {
                emerald: "bg-emerald-100 text-emerald-600 border-emerald-200",
                blue: "bg-blue-100 text-blue-600 border-blue-200",
                violet: "bg-violet-100 text-violet-600 border-violet-200",
                amber: "bg-amber-100 text-amber-600 border-amber-200",
              };

              return (
                <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-8 hover:shadow-lg transition-shadow">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border ${colorMap[feature.color]} mb-5`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
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
              Cuaderno vs. REPLACE
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid md:grid-cols-2">
              {/* Before column */}
              <div className="bg-red-50/50 p-8 md:border-r border-b md:border-b-0 border-slate-200">
                <div className="flex items-center gap-2 mb-6">
                  <X className="h-5 w-5 text-red-500" />
                  <h3 className="text-lg font-bold text-red-700">Sin software</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "Cuaderno con tachones y correcciones",
                    "Llamar uno por uno para confirmar",
                    "Doble agenda: un paciente, dos horarios",
                    "No sabes cuántas citas perdiste este mes",
                    "Pacientes se quejan de esperas largas",
                    "Cerrada cuando tu recepcionista se va",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-red-800">
                      <X className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* After column */}
              <div className="bg-emerald-50/50 p-8">
                <div className="flex items-center gap-2 mb-6">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-emerald-700">Con REPLACE</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "Calendario visual que no se pierde nunca",
                    "Recordatorios automáticos por WhatsApp y email",
                    "Conflictos detectados antes de agendar",
                    "Dashboard con tasa de no-show en tiempo real",
                    "Tiempos optimizados por servicio y doctor",
                    "Reserva online 24/7 sin necesitar recepción",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-emerald-800">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* ONLINE BOOKING SECTION                          */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 mb-4">
                <Globe className="h-3.5 w-3.5" />
                Incluido
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
                Tus pacientes reservan
                <span className="bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent"> mientras tú duermes.</span>
              </h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                Un link. Lo compartes por WhatsApp, lo pegas en tu bio de Instagram,
                lo pones en tu tarjeta. Tu paciente elige horario, doctor y servicio.
                La cita aparece en tu agenda. <strong>Sin llamadas. Sin intermediarios.</strong>
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Disponibilidad real sincronizada con tu agenda",
                  "Funciona desde cualquier celular — sin app",
                  "Confirmación automática por email al paciente",
                  "Reduce llamadas a recepción hasta un 60%",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Booking mockup */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="bg-emerald-600 px-5 py-4">
                <p className="text-white text-sm font-bold">Clínica de Oscar Duran</p>
                <p className="text-emerald-200 text-xs">Reserva tu cita online</p>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Servicio</label>
                  <div className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">Consulta ginecológica</div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Doctora</label>
                  <div className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">Dra. Angela Quispe</div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase">Fecha y hora</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {["09:00", "09:30", "10:00"].map((t) => (
                      <div key={t} className={`rounded-lg border px-3 py-2 text-xs text-center font-medium ${t === "09:30" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <button className="w-full mt-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">
                  Confirmar reserva
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* TESTIMONIAL                                     */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-8 md:p-12 text-center shadow-sm">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Pasé de un cuaderno con tachones a una agenda que se llena sola.
              Mis pacientes reservan por Instagram y yo solo llego a atender.
              En 3 meses reduje las inasistencias de 25% a 8%.&rdquo;
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
          <CalendarDays className="h-10 w-10 text-emerald-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Cada hora vacía en tu agenda
            <br />
            <span className="text-emerald-400">es dinero que no recuperas.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">
            Empieza hoy. Configura tu agenda en 5 minutos.
            14 días gratis. Sin tarjeta de crédito.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl gradient-primary px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto"
            >
              Empezar prueba gratis
              <ArrowRight className="h-4 w-4" />
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
            name: "REPLACE — Agenda Médica Online",
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            description: "Agenda médica online con calendario visual, múltiples doctores, reserva online 24/7 y detección de conflictos.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" },
          }),
        }}
      />
    </div>
  );
}
