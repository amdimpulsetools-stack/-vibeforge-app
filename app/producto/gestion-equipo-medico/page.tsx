import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  ArrowRight, ChevronRight, UsersRound, ShieldCheck, UserCheck, UserX,
  Eye, EyeOff, Lock, Mail, CheckCircle2, Crown, Stethoscope, ClipboardList,
  Headphones, AlertTriangle, Building2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Gestión de Equipo Médico — Roles y Permisos para Clínicas | REPLACE",
  description:
    "Administra tu equipo médico con roles y permisos granulares: doctores, recepcionistas, administradores. Horarios individuales, invitaciones por email y auditoría completa.",
  keywords: [
    "gestión equipo médico", "software multi usuario clínica", "roles y permisos médicos",
    "gestión personal consultorio", "software para clínica con roles",
  ],
  alternates: { canonical: "/producto/gestion-equipo-medico" },
};

const ROLES = [
  {
    role: "Owner",
    icon: Crown,
    color: "bg-amber-100 text-amber-700 border-amber-200",
    tagColor: "bg-amber-100 text-amber-700",
    desc: "Control total. Facturación, planes, configuración avanzada y acceso a todo.",
    perms: ["Configuración completa", "Gestión de planes y pagos", "Invitar/eliminar miembros", "Acceso a todos los módulos"],
  },
  {
    role: "Administrador",
    icon: ShieldCheck,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    tagColor: "bg-blue-100 text-blue-700",
    desc: "Gestión operativa. Todo menos facturación y configuración de planes.",
    perms: ["Gestión de doctores y servicios", "Reportes completos", "Configuración de agenda", "Sin acceso a facturación del plan"],
  },
  {
    role: "Recepcionista",
    icon: Headphones,
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    tagColor: "bg-emerald-100 text-emerald-700",
    desc: "Agendamiento y atención. Citas, pacientes y cobros — sin acceso clínico.",
    perms: ["Crear/editar/cancelar citas", "Registrar pacientes y pagos", "Sin acceso a notas clínicas", "Sin acceso a configuración"],
  },
  {
    role: "Doctor",
    icon: Stethoscope,
    color: "bg-violet-100 text-violet-700 border-violet-200",
    tagColor: "bg-violet-100 text-violet-700",
    desc: "Atención clínica. Sus pacientes, sus notas, sus recetas — nada más.",
    perms: ["Solo ve sus propias citas", "Notas SOAP, recetas, exámenes", "Cancela solo sus citas (con motivo)", "Sin acceso a reportes financieros"],
  },
];

export default function GestionEquipoPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-5xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/producto" className="hover:text-emerald-600">Producto</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium">Gestión de Equipo Médico</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-10 pb-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700 mb-6">
            <UsersRound className="h-3.5 w-3.5" />
            Roles + Permisos + Horarios
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            Cada persona ve
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">
              exactamente lo que necesita.
            </span>
            <br />
            Nada más.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Tu recepcionista no necesita ver notas clínicas. Tu doctor no necesita ver la facturación.
            <strong className="text-slate-900"> Cada rol tiene acceso solo a lo suyo.</strong>
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">
              Probar gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all w-full sm:w-auto">Ver planes</Link>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="py-20 px-4 md:px-6 bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Sin control de acceso,
            <span className="text-red-400"> todos ven todo.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">
            La recepcionista accede a historias clínicas sensibles.
            El doctor borra citas de otros. Nadie sabe quién cambió qué.
            Eso no es un equipo — es un riesgo.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { stat: "67%", label: "de clínicas", desc: "no tienen control de acceso por rol — todos los usuarios ven toda la información" },
              { stat: "1 error", label: "de un miembro", desc: "puede borrar, modificar o ver información sensible de pacientes sin restricción" },
              { stat: "0%", label: "de auditoría", desc: "en la mayoría de softwares: nadie registra quién hizo qué ni cuándo" },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
                <p className="text-4xl font-extrabold text-red-400">{item.stat}</p>
                <p className="text-sm font-semibold text-white mt-1">{item.label}</p>
                <p className="text-sm text-slate-400 mt-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 ROLES */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              4 roles. <span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">Permisos exactos.</span>
            </h2>
            <p className="mt-3 text-lg text-slate-600">Cada persona ve lo que necesita para hacer su trabajo. Nada más, nada menos.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.role} className={`rounded-2xl border bg-white p-6 hover:shadow-lg transition-shadow ${r.color.split(" ")[2]}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${r.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{r.role}</h3>
                      <p className="text-xs text-slate-500">{r.desc}</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {r.perms.map((p, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Mail, title: "Invitaciones por email", desc: "Invita a tu equipo con un enlace seguro. El nuevo miembro se registra y automáticamente hereda el rol asignado." },
              { icon: Building2, title: "Horarios por doctor", desc: "Cada doctor con su propia agenda: días, horarios, consultorios asignados. Sin conflictos entre profesionales." },
              { icon: Eye, title: "Auditoría de acciones", desc: "Registro automático de quién hizo qué: quién canceló la cita, quién editó la nota, quién registró el pago." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 mb-4"><Icon className="h-6 w-6" /></div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 p-8 md:p-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-slate-200 mb-6" />
            <blockquote className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed italic">
              &ldquo;Tenemos 4 doctores y 2 recepcionistas. Antes todos veían todo y era un caos.
              Ahora cada uno entra a lo suyo y si algo pasa, sé exactamente quién lo hizo.
              La tranquilidad que da eso no tiene precio.&rdquo;
            </blockquote>
            <div className="mt-6">
              <p className="text-sm font-bold text-slate-900">Nombre del administrador</p>
              <p className="text-xs text-slate-500">Centro médico — Ciudad, País</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-4 md:px-6 bg-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <UsersRound className="h-10 w-10 text-indigo-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Un equipo sin permisos
            <br /><span className="text-indigo-400">es un riesgo que no puedes permitir.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto">14 días gratis. Sin tarjeta de crédito.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all w-full sm:w-auto">Empezar prueba gratis <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/producto" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all w-full sm:w-auto">Ver todas las funciones</Link>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "REPLACE — Gestión de Equipo Médico", applicationCategory: "MedicalApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "PEN" } }) }} />
    </div>
  );
}
