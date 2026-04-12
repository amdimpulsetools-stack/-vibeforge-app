import {
  CalendarDays,
  FileText,
  Users,
  Pill,
  FlaskConical,
  MessageCircle,
  Mail,
  Globe,
  Sparkles,
  BarChart3,
  HeartPulse,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface ProductFeature {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  category: "funciones" | "automatizacion" | "analisis";
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
}

export const PRODUCT_CATEGORIES = {
  funciones: "Funciones principales",
  automatizacion: "Automatización",
  analisis: "Análisis y crecimiento",
} as const;

export const PRODUCT_FEATURES: ProductFeature[] = [
  // ─────── Funciones principales ───────
  {
    slug: "agenda-medica-online",
    title: "Agenda Médica Online",
    tagline: "Organiza citas, consultorios y doctores",
    description:
      "Calendario visual con drag-and-drop, detección automática de conflictos y vistas por día, semana o mes. Gestiona múltiples doctores y consultorios desde un solo lugar.",
    icon: CalendarDays,
    category: "funciones",
    metaTitle: "Agenda Médica Online — Software de Citas para Consultorios",
    metaDescription:
      "Agenda médica online con calendario visual, múltiples doctores y consultorios. Reduce conflictos de horarios y organiza tu clínica desde cualquier dispositivo.",
    keywords: [
      "agenda médica online",
      "software de agenda médica",
      "sistema de citas médicas",
      "agenda para consultorio",
      "calendario médico digital",
    ],
  },
  {
    slug: "historia-clinica-electronica",
    title: "Historia Clínica Electrónica",
    tagline: "HCE con SOAP, CIE-10 y firma digital",
    description:
      "Notas clínicas estructuradas en formato SOAP, diagnósticos con código CIE-10, signos vitales, plantillas reutilizables y firma digital. Historial completo por paciente.",
    icon: FileText,
    category: "funciones",
    metaTitle: "Historia Clínica Electrónica (HCE) — SOAP, CIE-10, Firma Digital",
    metaDescription:
      "Historia clínica electrónica con notas SOAP, diagnósticos CIE-10, plantillas y firma digital. Expediente médico completo, seguro y accesible desde la nube.",
    keywords: [
      "historia clínica electrónica",
      "HCE",
      "expediente clínico electrónico",
      "notas SOAP digitales",
      "software historia clínica",
      "CIE-10",
    ],
  },
  {
    slug: "gestion-pacientes",
    title: "Gestión de Pacientes",
    tagline: "Expediente completo, seguimientos y adherencia",
    description:
      "Ficha de paciente con datos demográficos, historial médico, adjuntos, tratamientos multi-sesión, seguimientos clínicos con prioridad (urgente, moderado, rutina) y etiquetas personalizables.",
    icon: Users,
    category: "funciones",
    metaTitle: "Gestión de Pacientes Médicos — Software para Consultorios",
    metaDescription:
      "Gestiona pacientes con fichas completas, historial médico, seguimientos clínicos y tratamientos multi-sesión. Software para consultorios y clínicas.",
    keywords: [
      "gestión de pacientes",
      "software gestión pacientes",
      "ficha del paciente",
      "sistema de pacientes clínica",
      "directorio de pacientes médicos",
    ],
  },
  {
    slug: "recetas-medicas-digitales",
    title: "Recetas Médicas Digitales",
    tagline: "Prescripciones e impresión profesional",
    description:
      "Crea recetas médicas con dosis, vía, frecuencia, duración e instrucciones. Imprímelas en formato A5 profesional con firma del médico, o envíalas por email al paciente.",
    icon: Pill,
    category: "funciones",
    metaTitle: "Recetas Médicas Digitales — Prescripciones Electrónicas",
    metaDescription:
      "Crea e imprime recetas médicas digitales con formato profesional. Guarda historial de prescripciones por paciente y envía recetas por email automáticamente.",
    keywords: [
      "recetas médicas digitales",
      "receta médica electrónica",
      "prescripción digital",
      "imprimir receta médica",
      "software de recetas",
    ],
  },
  {
    slug: "ordenes-examenes-medicos",
    title: "Órdenes de Exámenes",
    tagline: "Solicita y rastrea exámenes de laboratorio",
    description:
      "Catálogo configurable de exámenes por categoría (laboratorio, imagenología, cardiología). El doctor selecciona múltiples exámenes, agrega indicaciones e imprime la orden. Rastreo de resultados pendientes y completados.",
    icon: FlaskConical,
    category: "funciones",
    metaTitle: "Órdenes de Exámenes Médicos — Laboratorio e Imagenología",
    metaDescription:
      "Solicita exámenes médicos de laboratorio e imagenología con órdenes digitales imprimibles. Catálogo personalizable y seguimiento de resultados.",
    keywords: [
      "órdenes de exámenes médicos",
      "solicitud de análisis clínicos",
      "orden de laboratorio médica",
      "software de exámenes médicos",
    ],
  },

  // ─────── Automatización ───────
  {
    slug: "recordatorios-whatsapp-citas",
    title: "Recordatorios por WhatsApp",
    tagline: "Reduce inasistencias con mensajes automáticos",
    description:
      "Envía recordatorios automáticos por WhatsApp 24 horas y 2 horas antes de cada cita. Reduce la tasa de inasistencias y mantén tu agenda llena. Plantillas personalizables por tipo de notificación.",
    icon: MessageCircle,
    category: "automatizacion",
    metaTitle: "Recordatorios de Citas por WhatsApp — Reduce Inasistencias",
    metaDescription:
      "Envía recordatorios automáticos por WhatsApp antes de cada cita médica. Reduce inasistencias y mejora la ocupación de tu agenda hasta en un 40%.",
    keywords: [
      "recordatorios de citas WhatsApp",
      "WhatsApp para clínicas",
      "mensajes automáticos pacientes",
      "reducir inasistencias médicas",
      "WhatsApp médico",
    ],
  },
  {
    slug: "emails-confirmacion-citas",
    title: "Notificaciones por Email",
    tagline: "Confirmaciones, recordatorios y recibos",
    description:
      "Emails transaccionales automáticos con plantillas personalizables: confirmación de cita, recordatorios, cancelaciones, recibos de pago, factura, bienvenida a pacientes nuevos, cumpleaños y más.",
    icon: Mail,
    category: "automatizacion",
    metaTitle: "Emails Automáticos para Clínicas — Confirmación de Citas",
    metaDescription:
      "Envía emails automáticos de confirmación de citas, recordatorios, recibos y más. Plantillas personalizables con tu marca para clínicas y consultorios.",
    keywords: [
      "emails confirmación citas",
      "emails automáticos clínica",
      "plantillas email médico",
      "notificaciones por email",
    ],
  },
  {
    slug: "agenda-publica-online",
    title: "Reserva Online para Pacientes",
    tagline: "Link compartible para que pacientes reserven solos",
    description:
      "Ofrece un enlace público donde tus pacientes pueden reservar citas 24/7 desde cualquier dispositivo. Se sincroniza automáticamente con tu agenda y reduce llamadas a recepción.",
    icon: Globe,
    category: "automatizacion",
    metaTitle: "Reserva de Citas Online — Agenda Pública para Médicos",
    metaDescription:
      "Permite que tus pacientes reserven citas online las 24 horas con un link compartible. Agenda pública sincronizada automáticamente para clínicas.",
    keywords: [
      "reserva de citas online",
      "agenda pública médica",
      "booking online consultorio",
      "citas médicas por internet",
      "reservar cita médico online",
    ],
  },
  {
    slug: "asistente-ia-consultorio",
    title: "Asistente Médico con IA",
    tagline: "Resúmenes y análisis con inteligencia artificial",
    description:
      "Asistente de IA que responde preguntas sobre tu consultorio: cuánto facturaste este mes, tus pacientes más frecuentes, tendencias de agenda, insights de reportes y más. Lenguaje natural.",
    icon: Sparkles,
    category: "automatizacion",
    metaTitle: "Asistente IA para Consultorio Médico — Análisis Inteligente",
    metaDescription:
      "Asistente de inteligencia artificial para tu clínica. Pregúntale sobre tus citas, ingresos, pacientes y reportes en lenguaje natural. IA para médicos.",
    keywords: [
      "asistente IA consultorio",
      "inteligencia artificial médica",
      "IA para clínicas",
      "chatbot médico",
      "analytics clínica con IA",
    ],
  },

  // ─────── Análisis y crecimiento ───────
  {
    slug: "reportes-clinica-medica",
    title: "Reportes y Dashboards",
    tagline: "KPIs financieros, operativos y de marketing",
    description:
      "Reportes visuales con KPIs clave: ingresos vs metas, ocupación por doctor, origen de pacientes (Facebook, Google, referidos), estadísticas demográficas, tasa de no-show, tratamientos más comunes y más.",
    icon: BarChart3,
    category: "analisis",
    metaTitle: "Reportes para Clínica Médica — Dashboards y KPIs",
    metaDescription:
      "Reportes visuales y dashboards para tu clínica médica: ingresos, ocupación, origen de pacientes y KPIs en tiempo real. Toma decisiones basadas en datos.",
    keywords: [
      "reportes clínica médica",
      "dashboard consultorio",
      "KPI médico",
      "estadísticas clínica",
      "analytics médico",
    ],
  },
  {
    slug: "retencion-pacientes",
    title: "Retención de Pacientes",
    tagline: "Dashboard de LTV y reactivación",
    description:
      "Dashboard de retención con lifetime value por paciente, tasa de retorno, pacientes en riesgo de abandono y campañas de reactivación automáticas por email (seguimiento y cumpleaños).",
    icon: HeartPulse,
    category: "analisis",
    metaTitle: "Retención de Pacientes — Lifetime Value y Reactivación",
    metaDescription:
      "Mide y mejora la retención de pacientes de tu clínica. Dashboard de LTV, pacientes en riesgo y campañas automáticas de reactivación por email.",
    keywords: [
      "retención de pacientes",
      "LTV pacientes médicos",
      "reactivar pacientes clínica",
      "lifetime value clínica",
    ],
  },
  {
    slug: "gestion-equipo-medico",
    title: "Gestión de Equipo Médico",
    tagline: "Doctores, recepcionistas y permisos por rol",
    description:
      "Gestiona tu equipo con roles definidos: owner, administrador, recepcionista y doctor. Cada uno con permisos específicos. Horarios por doctor, consultorios asignados y control de acceso granular.",
    icon: UsersRound,
    category: "analisis",
    metaTitle: "Gestión de Equipo Médico — Roles y Permisos para Clínicas",
    metaDescription:
      "Administra tu equipo médico con roles y permisos: doctores, recepcionistas y administradores. Software multi-usuario seguro para clínicas y consultorios.",
    keywords: [
      "gestión equipo médico",
      "software multi usuario clínica",
      "roles y permisos médicos",
      "gestión personal consultorio",
    ],
  },
  {
    slug: "cobros-pagos-consultorio",
    title: "Cobros y Pagos",
    tagline: "Registra pagos, deudas y emite recibos",
    description:
      "Registra pagos por cita (efectivo, tarjeta, Yape, Plin, transferencia), controla saldos pendientes y visualiza la deuda por paciente. Envía recibos y facturas automáticamente por email.",
    icon: Wallet,
    category: "analisis",
    metaTitle: "Cobros y Pagos para Consultorio — Recibos y Facturación",
    metaDescription:
      "Registra pagos, controla deudas y emite recibos para tu consultorio médico. Sistema de cobros con múltiples métodos de pago y envío automático por email.",
    keywords: [
      "cobros consultorio médico",
      "pagos clínica",
      "facturación médica",
      "recibo de pago clínica",
      "control de pagos pacientes",
    ],
  },
];

export const FEATURES_BY_CATEGORY = {
  funciones: PRODUCT_FEATURES.filter((f) => f.category === "funciones"),
  automatizacion: PRODUCT_FEATURES.filter((f) => f.category === "automatizacion"),
  analisis: PRODUCT_FEATURES.filter((f) => f.category === "analisis"),
};

export function getFeatureBySlug(slug: string): ProductFeature | undefined {
  return PRODUCT_FEATURES.find((f) => f.slug === slug);
}
