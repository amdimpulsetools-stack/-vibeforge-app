"use client";

import { useState, useEffect, useRef } from "react";
import {
  Headset,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  CalendarCheck,
  Clock,
  AlertTriangle,
  Users,
  BarChart3,
  Settings,
  FileText,
  CreditCard,
  ClipboardList,
  Heart,
  Timer,
  Target,
  UserPlus,
  Megaphone,
  Repeat,
  PieChart,
} from "lucide-react";

type Role = "recepcion" | "admin" | "doctor" | "ventas";

interface RoleData {
  id: Role;
  label: string;
  icon: React.ElementType;
  color: string;
  activeColor: string;
  iconBg: string;
  headline: string;
  subline: string;
  painKiller: string;
  features: {
    icon: React.ElementType;
    title: string;
    description: string;
  }[];
  mockup: {
    title: string;
    items: { label: string; value: string; accent?: boolean }[];
  };
}

const roles: RoleData[] = [
  {
    id: "recepcion",
    label: "Recepcionista",
    icon: Headset,
    color: "text-blue-600",
    activeColor: "border-blue-500 bg-blue-50",
    iconBg: "bg-blue-100 text-blue-600",
    headline: "Cero caos en la agenda",
    subline:
      "Todo lo que tu recepcionista necesita en una sola pantalla. Sin WhatsApp, sin cuadernos, sin Excel.",
    painKiller:
      "Ya no necesita WhatsApp + cuaderno + Excel para manejar el día",
    features: [
      {
        icon: CalendarCheck,
        title: "Agendar en 3 clicks",
        description: "Paciente, doctor, servicio. Listo. Sin doble-agendamiento.",
      },
      {
        icon: Clock,
        title: "Vista del día completa",
        description:
          "Todas las citas del día con estado en tiempo real: confirmada, en sala, completada.",
      },
      {
        icon: AlertTriangle,
        title: "Follow-ups automáticos",
        description:
          "Nunca olvida un seguimiento. El sistema le recuerda qué pacientes necesitan llamada.",
      },
      {
        icon: Users,
        title: "Perfil de paciente al instante",
        description:
          "Historial, deudas, último servicio y notas. Todo antes de que el paciente se siente.",
      },
    ],
    mockup: {
      title: "Agenda — Hoy, Lunes 24",
      items: [
        { label: "9:00 — María García", value: "Consulta general", accent: false },
        { label: "9:30 — Carlos López", value: "Ecografía", accent: true },
        { label: "10:00 — Ana Rodríguez", value: "Control post-op", accent: false },
        { label: "10:30 — Libre", value: "Slot disponible", accent: false },
      ],
    },
  },
  {
    id: "admin",
    label: "Administrador",
    icon: ShieldCheck,
    color: "text-emerald-600",
    activeColor: "border-emerald-500 bg-emerald-50",
    iconBg: "bg-emerald-100 text-emerald-600",
    headline: "Control total, sin perseguir a nadie",
    subline:
      "Dashboard con métricas en tiempo real. Sabe cuánto se facturó, quién trabajó y qué falta — sin preguntar.",
    painKiller:
      "Sabe exactamente cuánto se facturó sin hacer cuentas a mano",
    features: [
      {
        icon: BarChart3,
        title: "Dashboard en tiempo real",
        description:
          "Revenue, ocupación, cancelaciones, no-shows. Todo actualizado al segundo.",
      },
      {
        icon: Settings,
        title: "Configuración centralizada",
        description:
          "Servicios, consultorios, horarios, permisos de equipo. Un solo lugar.",
      },
      {
        icon: FileText,
        title: "Reportes automáticos",
        description:
          "Financiero, operativo, marketing, retención. Exporta a CSV en un click.",
      },
      {
        icon: CreditCard,
        title: "Control de pagos y deudas",
        description:
          "Sabe quién pagó, quién debe y cuánto se cobró esta semana.",
      },
    ],
    mockup: {
      title: "Dashboard — Esta semana",
      items: [
        { label: "Revenue", value: "S/ 8,450", accent: true },
        { label: "Ocupación", value: "87%", accent: false },
        { label: "Citas completadas", value: "42 de 48", accent: false },
        { label: "Cancelaciones", value: "3 (6%)", accent: false },
      ],
    },
  },
  {
    id: "doctor",
    label: "Doctor",
    icon: Stethoscope,
    color: "text-purple-600",
    activeColor: "border-purple-500 bg-purple-50",
    iconBg: "bg-purple-100 text-purple-600",
    headline: "Enfócate en atender, nosotros manejamos el resto",
    subline:
      "Ve solo sus citas, complete notas clínicas con plantillas y acceda al historial completo del paciente.",
    painKiller:
      "No pierde tiempo en administración — solo en sus pacientes",
    features: [
      {
        icon: ClipboardList,
        title: "Notas SOAP pre-cargadas",
        description:
          "Plantillas por especialidad. Completa la consulta en minutos, no en horas.",
      },
      {
        icon: Heart,
        title: "Historial clínico completo",
        description:
          "Diagnósticos previos, prescripciones, tratamientos y adjuntos. Todo en una ficha.",
      },
      {
        icon: CalendarCheck,
        title: "Solo sus citas",
        description:
          "Ve únicamente su agenda del día. Sin ruido de otros doctores o áreas.",
      },
      {
        icon: Timer,
        title: "Tiempo optimizado",
        description:
          "Menos papeleo, más consultas. El sistema hace el trabajo administrativo.",
      },
    ],
    mockup: {
      title: "Mis citas — Dr. Ramos",
      items: [
        { label: "9:00 — María García", value: "Nota SOAP pendiente", accent: true },
        { label: "10:00 — Carlos López", value: "Completada", accent: false },
        { label: "11:00 — Ana Rodríguez", value: "En sala de espera", accent: true },
        { label: "12:00 — Libre", value: "Break almuerzo", accent: false },
      ],
    },
  },
  {
    id: "ventas",
    label: "Ventas & Marketing",
    icon: TrendingUp,
    color: "text-amber-600",
    activeColor: "border-amber-500 bg-amber-50",
    iconBg: "bg-amber-100 text-amber-600",
    headline: "Sabe de dónde vienen y cómo retenerlos",
    subline:
      "Reportes de origen, retención y crecimiento. Deja de invertir a ciegas y toma decisiones con datos.",
    painKiller:
      "Deja de invertir en marketing sin saber qué canal trae más pacientes",
    features: [
      {
        icon: Target,
        title: "Origen de pacientes",
        description:
          "Instagram, Google, referido, caminando. Sabe exactamente qué canal convierte más.",
      },
      {
        icon: UserPlus,
        title: "Nuevos vs recurrentes",
        description:
          "Mide tu crecimiento real: cuántos pacientes nuevos vs cuántos regresan.",
      },
      {
        icon: Repeat,
        title: "Tasa de retención",
        description:
          "Identifica cuántos pacientes no volvieron y activa campañas de reactivación.",
      },
      {
        icon: PieChart,
        title: "IA que sugiere",
        description:
          '"Pacientes de Instagram tienen 40% más retención" — insights automáticos.',
      },
    ],
    mockup: {
      title: "Marketing — Marzo 2026",
      items: [
        { label: "Pacientes nuevos", value: "45 este mes", accent: true },
        { label: "Top canal", value: "Instagram (38%)", accent: false },
        { label: "Retención", value: "74% (+8pp)", accent: true },
        { label: "Inactivos", value: "12 sin cita en 60 días", accent: false },
      ],
    },
  },
];

export function RoleSuperpowers() {
  const [activeRole, setActiveRole] = useState<Role>("recepcion");
  const sectionRef = useRef<HTMLDivElement>(null);

  const current = roles.find((r) => r.id === activeRole)!;

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
    <section className="py-20 sm:py-28 bg-white" id="roles">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 opacity-0 translate-y-8 transition-all duration-700 ease-out [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Cada rol, su superpoder
          </h2>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl mx-auto">
            Un flujo, cuatro perspectivas. Cada persona ve exactamente lo que necesita para hacer su trabajo mejor.
          </p>
        </div>

        {/* Role Tabs */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-12">
          {roles.map((role) => {
            const isActive = activeRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={`group flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 sm:px-5 sm:py-3 text-sm font-semibold transition-all duration-300 cursor-pointer ${
                  isActive
                    ? role.activeColor
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <role.icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? role.color : "text-slate-400 group-hover:text-slate-500"
                  }`}
                />
                <span className={isActive ? role.color : ""}>
                  {role.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content Grid */}
        <div
          key={activeRole}
          className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start animate-fade-in"
        >
          {/* Left: Text + Features (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Pain killer badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-500">
              <AlertTriangle className="h-3 w-3" />
              {current.painKiller}
            </div>

            <div>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
                {current.headline}
              </h3>
              <p className="mt-2 text-base text-slate-500 leading-relaxed max-w-xl">
                {current.subline}
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {current.features.map((feat, i) => (
                <div
                  key={feat.title}
                  className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition-all duration-300"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${current.iconBg}`}
                    >
                      <feat.icon className="h-4 w-4" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">
                      {feat.title}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Mockup card (2 cols) */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 overflow-hidden sticky top-24">
              {/* Mockup header */}
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 bg-slate-50/80">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${current.iconBg}`}
                >
                  <current.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {current.mockup.title}
                </p>
              </div>

              {/* Mockup content */}
              <div className="p-4 space-y-2">
                {current.mockup.items.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-all duration-300 ${
                      item.accent
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-100 bg-slate-50/30"
                    }`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span className="text-xs font-medium text-slate-700">
                      {item.label}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        item.accent ? "text-emerald-600" : "text-slate-500"
                      }`}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bottom hint */}
              <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                <p className="text-[10px] text-slate-400 text-center">
                  Vista real del panel de {current.label.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </section>
  );
}
