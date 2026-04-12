import {
  CalendarDays, Stethoscope, BarChart3, MessageCircle, Brain,
  Users, Shield, Sparkles, TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BlogCategory {
  slug: string;
  label: string;
  icon: LucideIcon;
}

export interface BlogArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  featured?: boolean;
  imageAlt?: string;
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: "todos", label: "Todos", icon: Sparkles },
  { slug: "agenda", label: "Agenda médica", icon: CalendarDays },
  { slug: "historia-clinica", label: "Historia clínica", icon: Stethoscope },
  { slug: "gestion", label: "Gestión de clínicas", icon: Users },
  { slug: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { slug: "reportes", label: "Reportes", icon: BarChart3 },
  { slug: "ia", label: "Inteligencia Artificial", icon: Brain },
  { slug: "marketing", label: "Marketing médico", icon: TrendingUp },
  { slug: "seguridad", label: "Seguridad y legal", icon: Shield },
];

export const BLOG_ARTICLES: BlogArticle[] = [
  // ── Featured (blogs completos) ──
  {
    slug: "digitalizar-consultorio-medico-peru",
    title: "Cómo digitalizar tu consultorio médico en Perú: guía paso a paso 2026",
    excerpt: "Guía paso a paso para digitalizar tu consultorio médico en Perú. Del cuaderno al software en 30 días sin perder pacientes ni complicarte.",
    category: "gestion",
    readTime: "12 min",
    date: "2026-04-10",
    featured: true,
    imageAlt: "Doctor revisando agenda digital en tablet",
  },
  {
    slug: "reducir-ausentismo-pacientes-clinica",
    title: "Cómo reducir el ausentismo de pacientes en tu clínica hasta un 40%",
    excerpt: "5 estrategias comprobadas para reducir inasistencias en tu consultorio. Incluye calculadora de pérdidas y automatización WhatsApp.",
    category: "agenda",
    readTime: "10 min",
    date: "2026-04-08",
    featured: true,
    imageAlt: "Calendario de citas médicas con recordatorios",
  },

  // ── Regular articles (blog 3 completo + placeholders) ──
  {
    slug: "notas-soap-formato-medico",
    title: "Notas SOAP: formato, ejemplos y cómo digitalizarlas en tu consultorio",
    excerpt: "Qué son las notas SOAP, cómo estructurarlas correctamente y por qué digitalizarlas. Incluye ejemplos por especialidad y plantilla descargable.",
    category: "historia-clinica",
    readTime: "11 min",
    date: "2026-04-06",
  },
  {
    slug: "mejores-software-medicos-peru-2026",
    title: "Los 7 mejores software médicos en Perú para 2026",
    excerpt: "Comparativa detallada de las plataformas más populares para consultorios y clínicas en Perú: funcionalidades, precios y para quién sirve cada una.",
    category: "gestion",
    readTime: "10 min",
    date: "2026-04-06",
  },
  {
    slug: "whatsapp-business-clinicas-guia",
    title: "WhatsApp Business para clínicas: la guía que necesitabas",
    excerpt: "Cómo configurar WhatsApp Business para tu consultorio, crear mensajes automáticos de recordatorio y reducir las llamadas de confirmación.",
    category: "whatsapp",
    readTime: "7 min",
    date: "2026-04-04",
  },
  {
    slug: "kpis-consultorio-medico-medir",
    title: "8 KPIs que todo consultorio médico debería medir (y probablemente no mide)",
    excerpt: "Tasa de no-show, LTV del paciente, ocupación por doctor, origen de pacientes... Los indicadores que separan a las clínicas que crecen de las que sobreviven.",
    category: "reportes",
    readTime: "9 min",
    date: "2026-04-02",
  },
  {
    slug: "inteligencia-artificial-consultorios-2026",
    title: "Inteligencia Artificial en consultorios médicos: qué es real y qué es humo en 2026",
    excerpt: "Separamos la realidad del marketing: qué puede hacer realmente la IA por tu práctica médica hoy, y qué todavía es ciencia ficción.",
    category: "ia",
    readTime: "6 min",
    date: "2026-03-30",
  },
  {
    slug: "agenda-online-vs-cuaderno-comparativa",
    title: "Agenda online vs cuaderno: la comparativa definitiva para médicos",
    excerpt: "¿Realmente necesitas un software o tu cuaderno funciona bien? Analizamos costos, riesgos y beneficios reales con datos de 50 consultorios.",
    category: "agenda",
    readTime: "7 min",
    date: "2026-03-28",
  },
  {
    slug: "receta-medica-digital-requisitos-peru",
    title: "Receta médica digital en Perú: requisitos legales y cómo implementarla",
    excerpt: "Todo sobre la validez legal de las recetas digitales en Perú, requisitos del Colegio Médico y cómo empezar a usarlas en tu consultorio.",
    category: "seguridad",
    readTime: "8 min",
    date: "2026-03-25",
  },
  {
    slug: "marketing-digital-clinicas-redes-sociales",
    title: "Marketing digital para clínicas: cómo conseguir pacientes por redes sociales",
    excerpt: "Instagram, TikTok, Google — por dónde empezar, cuánto invertir y cómo medir resultados. Guía práctica para médicos sin experiencia en marketing.",
    category: "marketing",
    readTime: "11 min",
    date: "2026-03-22",
  },
  {
    slug: "gestion-pacientes-retencion-estrategias",
    title: "5 estrategias de retención de pacientes que funcionan (con datos)",
    excerpt: "El 35% de los pacientes no regresan después de la primera consulta. Estas son las 5 tácticas que las clínicas más rentables usan para retenerlos.",
    category: "gestion",
    readTime: "8 min",
    date: "2026-03-20",
  },
  {
    slug: "soap-notas-clinicas-formato-guia",
    title: "Formato SOAP para notas clínicas: guía práctica con ejemplos",
    excerpt: "Qué es el formato SOAP, cómo usarlo correctamente, errores comunes y ejemplos reales por especialidad. Incluye plantillas descargables.",
    category: "historia-clinica",
    readTime: "9 min",
    date: "2026-03-18",
  },
  {
    slug: "cobros-consultorio-medico-evitar-deudas",
    title: "Cómo cobrar en tu consultorio sin perder pacientes (ni dinero)",
    excerpt: "Políticas de cobro, múltiples métodos de pago, facturación y cómo manejar deudas sin dañar la relación médico-paciente.",
    category: "gestion",
    readTime: "7 min",
    date: "2026-03-15",
  },
];

export function getArticlesByCategory(cat: string): BlogArticle[] {
  if (cat === "todos") return BLOG_ARTICLES;
  return BLOG_ARTICLES.filter((a) => a.category === cat);
}

export function getFeaturedArticles(): BlogArticle[] {
  return BLOG_ARTICLES.filter((a) => a.featured);
}

export function getCategoryLabel(slug: string): string {
  return BLOG_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}
