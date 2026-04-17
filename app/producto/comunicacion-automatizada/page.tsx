import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { Reveal } from "@/components/landing/reveal";
import {
  ArrowRight, ChevronRight, MessageCircle, Mail, Bell, Smartphone,
  CheckCircle2, X, Check, Clock, Gift, UserPlus, CalendarX2, Receipt,
  Send, Zap, BarChart3,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Recordatorios WhatsApp y Email para Clínicas — Automatización | REPLACE",
  description:
    "Envía recordatorios automáticos por WhatsApp y email antes de cada cita. Confirmaciones, cancelaciones, recibos, bienvenida, cumpleaños y seguimiento de pacientes inactivos.",
  keywords: [
    "recordatorios citas WhatsApp", "emails automáticos clínica", "reducir inasistencias",
    "confirmación citas médicas", "WhatsApp para clínicas", "automatización consultorio",
  ],
  alternates: { canonical: "/producto/comunicacion-automatizada" },
};

const EMAIL_TYPES = [
  { icon: Bell, label: "Recordatorio 24h", desc: "Un día antes de la cita por WhatsApp y email", color: "amber" },
  { icon: Clock, label: "Recordatorio 2h", desc: "Dos horas antes como último aviso", color: "amber" },
  { icon: CheckCircle2, label: "Confirmación de cita", desc: "Al momento de agendar o reservar online", color: "emerald" },
  { icon: CalendarX2, label: "Cita cancelada", desc: "Aviso automático si la cita fue cancelada", color: "red" },
  { icon: Receipt, label: "Recibo de pago", desc: "Al registrar un pago en la cita", color: "blue" },
  { icon: UserPlus, label: "Bienvenida", desc: "Cuando se registra un paciente nuevo", color: "teal" },
  { icon: Gift, label: "Cumpleaños", desc: "Cada año en la fecha de nacimiento del paciente", color: "pink" },
  { icon: Send, label: "Seguimiento", desc: "Si el paciente no vuelve en 90+ días", color: "violet" },
];

export default function ComunicacionPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-5xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/producto" className="hover:text-emerald-600">Producto</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium">Comunicación Automatizada</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-xs font-semibold text-green-700 mb-6">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp + Email + Automático
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            Tú atiendes pacientes.
            <br />
            <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
              Los mensajes se envían solos.
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Cada cita confirmada. Cada recordatorio enviado. Cada recibo entregado.
            <strong className="text-slate-900"> Tu recepcionista se enfoca en lo más importante, cerrar citas y agendar pacientes.</strong>
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
              Probar gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">Ver planes</Link>
          </div>
        </div>

        {/* WhatsApp mockup with floating cards */}
        <div className="mt-16 mx-auto max-w-sm relative lg:max-w-2xl lg:px-32">
          <div className="relative mx-auto max-w-sm">
            <div className="rounded-2xl border border-slate-200 bg-[#ECE5DD] shadow-xl overflow-hidden">
              <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-bold">Clínica REPLACE</p>
                  <p className="text-green-200 text-[10px]">Mensaje automático</p>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="max-w-[85%] rounded-xl rounded-tl-md bg-white px-4 py-2.5 shadow-sm">
                  <p className="text-sm text-slate-800">Hola <strong>María</strong> 👋</p>
                  <p className="text-sm text-slate-800 mt-1">
                    Te recordamos que tienes una cita <strong>mañana martes 9 de abril</strong> a las <strong>10:30 AM</strong> con la <strong>Dra. Angela Quispe</strong>.
                  </p>
                  <p className="text-sm text-slate-800 mt-1">📍 Consultorio #1</p>
                  <p className="text-sm text-slate-600 mt-2 italic">
                    Por favor llega 10 minutos antes. Si necesitas cancelar, avísanos con anticipación.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">3:00 p.m. ✓✓</p>
                </div>
              </div>
            </div>

            {/* Floating Gmail confirmation card — top right */}
            <div
              className="hidden lg:block absolute -top-6 -right-40 w-64 rotate-3 z-20 hero-float-card"
              style={{ ["--float-delay" as string]: "0.7s" }}
            >
              <div className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 flex items-center gap-2 border-b border-slate-200">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 ml-1">Bandeja de entrada</span>
                </div>
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    {/* Gmail logo */}
                    <svg className="h-8 w-8 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="url(#gmail-grad)"/>
                      <defs>
                        <linearGradient id="gmail-grad" x1="0" y1="0" x2="24" y2="24">
                          <stop offset="0%" stopColor="#EA4335"/>
                          <stop offset="30%" stopColor="#FBBC05"/>
                          <stop offset="60%" stopColor="#34A853"/>
                          <stop offset="100%" stopColor="#4285F4"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-slate-900 truncate">Clínica REPLACE</p>
                        <span className="text-[9px] text-slate-400">3:00 p.m.</span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-800 mt-0.5 leading-tight">
                        Confirmación de tu cita — Dra. Angela Quispe
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                        Mar 9 abr · 10:30 AM · Consultorio #1
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Birthday discount card — bottom left */}
            <div
              className="hidden lg:block absolute -bottom-8 -left-40 w-60 -rotate-3 z-20 hero-float-card"
              style={{ ["--float-delay" as string]: "1.2s" }}
            >
              <div className="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50 shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-white" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                    Feliz cumpleaños 🎂
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-[11px] text-slate-700 leading-snug">
                    Hola <strong>María</strong>, en tu día tenemos un regalo para ti:
                  </p>
                  <div className="mt-2 rounded-lg border-2 border-dashed border-pink-400 bg-white px-3 py-2 text-center">
                    <p className="text-2xl font-extrabold bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                      10% OFF
                    </p>
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">
                      en tu próxima consulta
                    </p>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-2 text-center">
                    Válido por 30 días · Código: <strong className="text-pink-600">BDAY10</strong>
                  </p>
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
            Cada paciente que no llega
            <span className="text-green-400"> es una hora vacía que no recuperas.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">
            Sin recordatorio → no llega. Sin confirmación → no sabe si se agendó.
            Sin seguimiento → nunca regresa. Todo por no enviar un mensaje a tiempo.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { stat: "25%", label: "de inasistencias", desc: "es el promedio en clínicas SIN recordatorios automáticos" },
              { stat: "8%", label: "con recordatorios", desc: "las clínicas con WhatsApp + email reducen no-shows a menos del 10%" },
              { stat: "4h/sem", label: "de tu recepcionista", desc: "se gasta llamando para confirmar citas que podrían confirmarse solas" },
            ].map((item, idx) => (
              <Reveal key={idx} delay={idx * 120} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                <p className="text-4xl font-extrabold text-green-400">{item.stat}</p>
                <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 8 EMAIL TYPES */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              8 mensajes automáticos.
              <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent"> Cero esfuerzo.</span>
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Cada uno se dispara solo cuando ocurre el evento. Tú no haces nada.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {EMAIL_TYPES.map((et, idx) => {
              const Icon = et.icon;
              const colorMap: Record<string, string> = {
                amber: "bg-amber-100 text-amber-600", emerald: "bg-emerald-100 text-emerald-600",
                red: "bg-red-100 text-red-600", blue: "bg-blue-100 text-blue-600",
                teal: "bg-teal-100 text-teal-600", pink: "bg-pink-100 text-pink-600",
                violet: "bg-violet-100 text-violet-600",
              };
              return (
                <Reveal key={et.label} delay={idx * 80} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[et.color]} mb-3`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">{et.label}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{et.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Manual vs. Automático</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid md:grid-cols-2">
              <div className="bg-red-50/50 p-8 md:border-r border-b md:border-b-0 border-slate-200">
                <div className="flex items-center gap-2 mb-6"><X className="h-5 w-5 text-red-500" /><h3 className="text-lg font-bold text-red-700">Manual</h3></div>
                <ul className="space-y-4">
                  {["Llamar paciente por paciente para confirmar", "Enviar WhatsApp uno por uno copiando texto", "Olvidar recordatorios en días ocupados", "No saber quién confirmó y quién no", "Recepcionista saturada todo el día"].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-red-800"><X className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />{item}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-emerald-50/50 p-8">
                <div className="flex items-center gap-2 mb-6"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-bold text-emerald-700">Con REPLACE</h3></div>
                <ul className="space-y-4">
                  {["Recordatorios automáticos 24h y 2h antes", "WhatsApp + email se envían juntos", "Funciona aunque tu equipo esté ocupado", "Dashboard con tasa de confirmación", "Recepcionista libre para atender pacientes"].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CUSTOMIZATION */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl grid gap-12 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              Plantillas editables
              <span className="bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent"> con tu marca.</span>
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Cada mensaje usa variables dinámicas que se reemplazan automáticamente.
              Personaliza el texto, activa o desactiva cada plantilla, y agrega el tono de tu clínica.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Variables: nombre, fecha, hora, doctor, servicio, dirección, monto",
                "Branding: logo, color de acento, nombre del remitente",
                "Indicaciones del servicio automáticas (ej: 'venir en ayunas')",
                "Activa/desactiva cada plantilla independientemente",
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <div className="text-center">
              <Mail className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Captura: Editor de plantillas</p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-8 md:p-12 text-center shadow-sm">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Mi recepcionista pasaba 3 horas al día confirmando citas por teléfono.
              Ahora los mensajes salen solos y ella se dedica a atender bien a quienes llegan.
              Las inasistencias bajaron de 22% a 7% en el primer mes.&rdquo;
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
          <MessageCircle className="h-10 w-10 text-green-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            El mensaje que no envías
            <br /><span className="text-green-400">es el paciente que no llega.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">14 días gratis. Sin tarjeta de crédito.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">Empezar prueba gratis <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/producto" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all w-full sm:w-auto">Ver todas las funciones</Link>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "REPLACE — Comunicación Automatizada", applicationCategory: "MedicalApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" } }) }} />
    </div>
  );
}
