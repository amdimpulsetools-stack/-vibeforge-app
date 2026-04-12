import {
  CalendarDays,
  FileText,
  Users,
  MessageCircle,
  Sparkles,
  BarChart3,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface ProductFeature {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** Sub-features that this page covers (for overview cards) */
  includes?: string[];
}

export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    slug: "agenda-medica-online",
    title: "Agenda Médica Online",
    tagline: "Organiza citas, consultorios y permite reservas 24/7",
    description:
      "Calendario visual con drag-and-drop, múltiples doctores y consultorios, detección de conflictos y reserva online para que tus pacientes agenden solos.",
    icon: CalendarDays,
    includes: ["Calendario drag-and-drop", "Multi-doctor y multi-consultorio", "Reserva online para pacientes", "Bloqueos de horario"],
    metaTitle: "Agenda Médica Online — Citas y Reservas para Consultorios | REPLACE",
    metaDescription:
      "Agenda médica online con calendario visual, múltiples doctores, reserva online 24/7 y detección de conflictos. Software de citas para clínicas y consultorios.",
    keywords: [
      "agenda médica online",
      "sistema de citas médicas",
      "reserva de citas online",
      "software agenda consultorio",
      "calendario médico digital",
    ],
  },
  {
    slug: "historia-clinica-electronica",
    title: "Historia Clínica Electrónica",
    tagline: "HCE con SOAP, recetas digitales y órdenes de exámenes",
    description:
      "Notas clínicas SOAP con CIE-10, firma digital, prescripciones imprimibles, órdenes de laboratorio e imagenología, plantillas reutilizables y versionado completo.",
    icon: FileText,
    includes: ["Notas SOAP + CIE-10", "Recetas médicas digitales", "Órdenes de exámenes", "Plantillas clínicas"],
    metaTitle: "Historia Clínica Electrónica — SOAP, Recetas, Exámenes | REPLACE",
    metaDescription:
      "Historia clínica electrónica con notas SOAP, diagnósticos CIE-10, recetas digitales imprimibles, órdenes de exámenes y firma digital. Software médico completo.",
    keywords: [
      "historia clínica electrónica",
      "HCE",
      "receta médica digital",
      "notas SOAP",
      "expediente clínico electrónico",
      "orden de exámenes médicos",
    ],
  },
  {
    slug: "gestion-pacientes",
    title: "Gestión de Pacientes",
    tagline: "Expediente completo, seguimientos y adherencia",
    description:
      "Ficha de paciente con datos demográficos, historial unificado, adjuntos, planes de tratamiento multi-sesión, seguimientos clínicos y etiquetas personalizables.",
    icon: Users,
    includes: ["Ficha completa del paciente", "Tratamientos multi-sesión", "Seguimientos clínicos", "Adjuntos y documentos"],
    metaTitle: "Gestión de Pacientes Médicos — Expedientes y Seguimientos | REPLACE",
    metaDescription:
      "Gestiona pacientes con fichas completas, historial médico unificado, tratamientos multi-sesión y seguimientos clínicos. Software para consultorios y clínicas.",
    keywords: [
      "gestión de pacientes",
      "expediente del paciente",
      "ficha de paciente médico",
      "seguimiento clínico",
      "software gestión pacientes",
    ],
  },
  {
    slug: "comunicacion-automatizada",
    title: "Comunicación Automatizada",
    tagline: "WhatsApp, emails y recordatorios sin esfuerzo",
    description:
      "Recordatorios automáticos por WhatsApp y email antes de cada cita. Confirmaciones, cancelaciones, recibos de pago, emails de bienvenida, cumpleaños y seguimiento de inactivos.",
    icon: MessageCircle,
    includes: ["Recordatorios WhatsApp", "Emails de confirmación", "Resumen diario al equipo", "Emails de bienvenida y cumpleaños"],
    metaTitle: "Recordatorios de Citas WhatsApp y Email — Automatización Médica | REPLACE",
    metaDescription:
      "Envía recordatorios automáticos por WhatsApp y email. Reduce inasistencias hasta 40%. Confirmaciones, recibos, cumpleaños y seguimiento de pacientes inactivos.",
    keywords: [
      "recordatorios citas WhatsApp",
      "emails automáticos clínica",
      "reducir inasistencias médicas",
      "confirmación citas",
      "WhatsApp para clínicas",
    ],
  },
  {
    slug: "asistente-ia-consultorio",
    title: "Asistente Médico con IA",
    tagline: "Pregunta en español, recibe insights con datos reales",
    description:
      "Asistente de inteligencia artificial que responde preguntas sobre tu clínica en lenguaje natural: ingresos, pacientes frecuentes, tendencias de agenda, insights de reportes y más.",
    icon: Sparkles,
    includes: ["Preguntas en lenguaje natural", "Análisis financiero instantáneo", "Tendencias y patrones", "Recomendaciones accionables"],
    metaTitle: "Asistente IA para Consultorio Médico — Análisis Inteligente | REPLACE",
    metaDescription:
      "Asistente de inteligencia artificial para tu clínica. Pregúntale sobre ingresos, pacientes, ocupación y reportes en lenguaje natural. IA médica potenciada por Claude.",
    keywords: [
      "asistente IA consultorio",
      "inteligencia artificial clínica",
      "IA para médicos",
      "analytics clínica IA",
      "chatbot médico",
    ],
  },
  {
    slug: "reportes-clinica-medica",
    title: "Reportes y Analítica",
    tagline: "Ingresos, retención, cobros y KPIs en tiempo real",
    description:
      "Dashboards financieros, operativos y de marketing. Lifetime value por paciente, origen de pacientes (redes sociales, referidos), control de cobros y deudas, y exportación a CSV.",
    icon: BarChart3,
    includes: ["Dashboard financiero", "Retención de pacientes (LTV)", "Cobros y deudas", "Origen de pacientes y demografía"],
    metaTitle: "Reportes para Clínica Médica — Dashboards, KPIs y Analítica | REPLACE",
    metaDescription:
      "Reportes visuales para tu clínica: ingresos vs metas, retención de pacientes, cobros pendientes, origen de pacientes y KPIs en tiempo real. Toma decisiones con datos.",
    keywords: [
      "reportes clínica médica",
      "dashboard consultorio",
      "KPI médico",
      "retención pacientes",
      "cobros consultorio médico",
    ],
  },
  {
    slug: "gestion-equipo-medico",
    title: "Gestión de Equipo Médico",
    tagline: "Doctores, recepcionistas y permisos por rol",
    description:
      "Gestiona tu equipo con roles: owner, admin, recepcionista y doctor. Horarios individuales, consultorios asignados, control de acceso granular y auditoría de cambios.",
    icon: UsersRound,
    includes: ["Roles y permisos granulares", "Horarios por doctor", "Invitaciones por email", "Auditoría de acciones"],
    metaTitle: "Gestión de Equipo Médico — Roles y Permisos para Clínicas | REPLACE",
    metaDescription:
      "Administra tu equipo médico con roles y permisos: doctores, recepcionistas y administradores. Software multi-usuario seguro para clínicas y consultorios.",
    keywords: [
      "gestión equipo médico",
      "software multi usuario clínica",
      "roles y permisos médicos",
      "gestión personal consultorio",
    ],
  },
];

export function getFeatureBySlug(slug: string): ProductFeature | undefined {
  return PRODUCT_FEATURES.find((f) => f.slug === slug);
}
