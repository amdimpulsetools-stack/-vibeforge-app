import {
  FileSignature,
  Package,
  UserCircle,
  MessageSquare,
  Receipt,
  MousePointerClick,
  Sparkles,
  GraduationCap,
  Brain,
  ListPlus,
  Target,
  BadgePercent,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const UPCOMING_FEATURES = [
  {
    icon: FileSignature,
    title: "Consentimiento Informado Digital",
    desc: "Templates por servicio, firma digital del paciente en tablet o celular, y almacenamiento seguro como PDF. Cumple con la Ley 29414.",
    status: "En desarrollo",
    color: "violet",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp Business API",
    desc: "Envío automático de recordatorios, confirmaciones y seguimiento por WhatsApp. Sin copiar y pegar — todo automático.",
    status: "Próximamente",
    color: "green",
  },
  {
    icon: Receipt,
    title: "Comprobantes de Pago (SUNAT)",
    desc: "Impresión de recibos y boletas con formato legal para impresora térmica o A4. Compatible con normativa SUNAT.",
    status: "Próximamente",
    color: "amber",
  },
  {
    icon: MousePointerClick,
    title: "Confirmación de Cita 1-click",
    desc: "El paciente confirma su cita directamente desde el email con un solo click, sin necesidad de llamar o responder.",
    status: "Próximamente",
    color: "blue",
  },
  {
    icon: UserCircle,
    title: "Portal del Paciente",
    desc: "Acceso propio del paciente para ver sus citas, resultados, pagos, documentos y reagendar sin llamar a la clínica.",
    status: "En planificación",
    color: "teal",
  },
  {
    icon: Package,
    title: "Inventario de Insumos",
    desc: "Control de stock de insumos médicos, alertas de reposición y asociación de consumo por cita o servicio.",
    status: "En planificación",
    color: "orange",
  },
  {
    icon: GraduationCap,
    title: "Entrenamiento de Recepcionistas",
    desc: "Modelo de entrenamiento de respuestas y técnicas de venta para que tu recepcionista cierre más citas y mejore la conversión.",
    status: "En planificación",
    color: "pink",
  },
  {
    icon: Brain,
    title: "Reporte IA Inteligente Ampliado",
    desc: "Más datos accionables en el reporte de IA: tendencias, predicciones de demanda, recomendaciones personalizadas por doctor y servicio.",
    status: "En desarrollo",
    color: "indigo",
  },
  {
    icon: ListPlus,
    title: "Custom Fields en Ficha del Paciente",
    desc: "Crea campos personalizados en la ficha del paciente eligiendo el tipo de campo (texto, número, fecha, opciones). Disponible como add-on.",
    status: "Próximamente",
    color: "cyan",
  },
  {
    icon: Target,
    title: "Metas para Recepcionistas",
    desc: "Define objetivos mensuales de citas agendadas, conversión y cobros. Seguimiento en tiempo real con dashboard de desempeño.",
    status: "En planificación",
    color: "rose",
  },
  {
    icon: BadgePercent,
    title: "Servicio Sin Costo (Cortesía)",
    desc: "Toggle en la ficha del paciente para anular el costo de un servicio por canje o trato especial. Confirmación con modal para evitar errores.",
    status: "Próximamente",
    color: "lime",
  },
];

const STATUS_STYLES: Record<string, string> = {
  "En desarrollo": "bg-violet-100 text-violet-700 border-violet-200",
  "Próximamente": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "En planificación": "bg-slate-100 text-slate-600 border-slate-200",
};

const COLOR_MAP: Record<string, string> = {
  violet: "bg-violet-100 text-violet-600",
  green: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  blue: "bg-blue-100 text-blue-600",
  teal: "bg-teal-100 text-teal-600",
  orange: "bg-orange-100 text-orange-600",
  pink: "bg-pink-100 text-pink-600",
  indigo: "bg-indigo-100 text-indigo-600",
  cyan: "bg-cyan-100 text-cyan-600",
  rose: "bg-rose-100 text-rose-600",
  lime: "bg-lime-100 text-lime-600",
};

export function ComingUpdates() {
  return (
    <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-700 mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Roadmap público
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Lo que viene.
            <span className="bg-gradient-to-r from-violet-600 to-emerald-500 bg-clip-text text-transparent"> Y no para.</span>
          </h2>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            Cada mes lanzamos mejoras basadas en lo que nuestros doctores y clínicas piden.
            Estas son las siguientes.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {UPCOMING_FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Reveal
                key={feature.title}
                delay={idx * 80}
                className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${COLOR_MAP[feature.color]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[feature.status]}`}>
                    {feature.status}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1.5">{feature.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{feature.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
