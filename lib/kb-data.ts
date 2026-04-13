import {
  Rocket, Settings, CalendarDays, Users, FileText,
  MessageCircle, BarChart3, Shield,
  type LucideIcon,
} from "lucide-react";

export interface KBArticle {
  slug: string;
  title: string;
  desc: string;
  category: string;
  categoryLabel: string;
  readTime: string;
  icon: LucideIcon;
}

export const KB_CATEGORIES: Record<string, { label: string; icon: LucideIcon }> = {
  "como-empezar": { label: "Cómo empezar", icon: Rocket },
  "ajustes-cuenta": { label: "Ajustes de cuenta", icon: Settings },
  "agenda-citas": { label: "Agenda y citas", icon: CalendarDays },
  "pacientes": { label: "Pacientes", icon: Users },
  "historia-clinica": { label: "Historia clínica", icon: FileText },
  "comunicacion": { label: "Comunicación", icon: MessageCircle },
  "reportes": { label: "Reportes", icon: BarChart3 },
  "seguridad-roles": { label: "Seguridad y roles", icon: Shield },
};

export const KB_ARTICLES: KBArticle[] = [
  {
    slug: "guia-inicio-rapido",
    title: "Comienza con REPLACE: guía de inicio rápido",
    desc: "Aprende a configurar tu cuenta, agregar doctores, crear servicios y agendar tu primera cita en menos de 10 minutos.",
    category: "como-empezar",
    categoryLabel: "Cómo empezar",
    readTime: "4 min",
    icon: Rocket,
  },
  {
    slug: "configurar-recordatorios-whatsapp",
    title: "Cómo configurar recordatorios por WhatsApp",
    desc: "Conecta WhatsApp Business API y activa recordatorios automáticos 24h y 2h antes de cada cita.",
    category: "comunicacion",
    categoryLabel: "Comunicación",
    readTime: "5 min",
    icon: MessageCircle,
  },
  {
    slug: "notas-soap-plantillas",
    title: "Crear notas clínicas SOAP con plantillas",
    desc: "Usa el editor SOAP con autocompletado CIE-10, signos vitales y plantillas reutilizables por especialidad.",
    category: "historia-clinica",
    categoryLabel: "Historia clínica",
    readTime: "6 min",
    icon: FileText,
  },
  {
    slug: "roles-permisos",
    title: "Gestionar roles y permisos del equipo",
    desc: "Configura los 4 roles (Owner, Admin, Recepcionista, Doctor) y define qué puede ver y hacer cada uno.",
    category: "seguridad-roles",
    categoryLabel: "Seguridad y roles",
    readTime: "4 min",
    icon: Shield,
  },
  {
    slug: "registrar-pagos-deudas",
    title: "Registrar pagos y controlar deudas",
    desc: "Cómo registrar pagos por cita, visualizar saldos pendientes y enviar recibos automáticos por email.",
    category: "reportes",
    categoryLabel: "Reportes",
    readTime: "5 min",
    icon: BarChart3,
  },
  {
    slug: "reserva-online-pacientes",
    title: "Configurar la reserva online para pacientes",
    desc: "Genera un link público donde tus pacientes reservan 24/7. Sincronización automática con tu agenda.",
    category: "agenda-citas",
    categoryLabel: "Agenda y citas",
    readTime: "4 min",
    icon: CalendarDays,
  },
];
