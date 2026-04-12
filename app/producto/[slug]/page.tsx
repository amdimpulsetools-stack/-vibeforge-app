import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, CheckCircle2, Check, ChevronRight } from "lucide-react";
import {
  PRODUCT_FEATURES,
  getFeatureBySlug,
  PRODUCT_CATEGORIES,
} from "@/lib/product-features";
import { APP_NAME } from "@/lib/constants";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for all feature pages at build time
export function generateStaticParams() {
  return PRODUCT_FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return {};

  return {
    title: feature.metaTitle,
    description: feature.metaDescription,
    keywords: feature.keywords,
    openGraph: {
      title: feature.metaTitle,
      description: feature.metaDescription,
      type: "website",
    },
    alternates: {
      canonical: `/producto/${feature.slug}`,
    },
  };
}

// Benefit bullets per feature (SEO content)
const FEATURE_BENEFITS: Record<string, string[]> = {
  "agenda-medica-online": [
    "Calendario visual drag-and-drop con vistas día, semana y mes",
    "Detección automática de conflictos de horarios",
    "Múltiples doctores y consultorios sincronizados",
    "Bloqueos de horario para almuerzos, vacaciones y emergencias",
    "Acceso desde cualquier dispositivo con conexión a internet",
  ],
  "historia-clinica-electronica": [
    "Notas clínicas en formato SOAP (Subjetivo, Objetivo, Análisis, Plan)",
    "Diagnósticos con autocompletado de códigos CIE-10",
    "Signos vitales con visualización de tendencias",
    "Plantillas reutilizables para agilizar la documentación",
    "Firma digital y versionado automático para auditoría",
  ],
  "gestion-pacientes": [
    "Ficha completa con datos demográficos, contacto y origen",
    "Historial médico unificado por paciente",
    "Adjuntos: resultados de laboratorio, imágenes y documentos",
    "Planes de tratamiento multi-sesión con seguimiento",
    "Etiquetas personalizables y filtros avanzados",
  ],
  "recetas-medicas-digitales": [
    "Crea prescripciones con dosis, vía, frecuencia y duración",
    "Catálogo de indicaciones comunes para agilizar el proceso",
    "Imprime recetas en formato A5 profesional con firma",
    "Envía la receta por email directamente al paciente",
    "Historial completo de prescripciones por paciente",
  ],
  "ordenes-examenes-medicos": [
    "Catálogo personalizable por categoría (laboratorio, imagenología)",
    "Selección múltiple de exámenes con indicaciones específicas",
    "Diagnóstico presuntivo con código CIE-10 en la orden",
    "Imprime órdenes en formato profesional con firma del médico",
    "Rastreo del estado: pendiente, parcial o completado",
  ],
  "recordatorios-whatsapp-citas": [
    "Recordatorios automáticos 24 horas y 2 horas antes de la cita",
    "Plantillas personalizables por tipo de notificación",
    "Confirmación de asistencia con un solo clic",
    "Reducción comprobada de inasistencias hasta en un 40%",
    "Integración con WhatsApp Business API",
  ],
  "emails-confirmacion-citas": [
    "Confirmación automática al agendar una cita",
    "Recordatorios programados antes de la consulta",
    "Emails de bienvenida para pacientes nuevos",
    "Recibos y facturas enviados automáticamente al registrar pago",
    "Emails de cumpleaños y seguimiento de pacientes inactivos",
  ],
  "agenda-publica-online": [
    "Link compartible para redes sociales, WhatsApp y tarjetas",
    "Tus pacientes reservan 24/7 desde cualquier dispositivo",
    "Sincronización automática con tu agenda interna",
    "Reduce llamadas a recepción hasta en un 60%",
    "Confirmación por email al paciente y al equipo",
  ],
  "asistente-ia-consultorio": [
    "Preguntas en lenguaje natural sobre tu consultorio",
    "Resúmenes inteligentes de reportes financieros",
    "Análisis de tendencias de citas y pacientes",
    "Recomendaciones basadas en datos de tu clínica",
    "Potenciado por Anthropic Claude para máxima precisión",
  ],
  "reportes-clinica-medica": [
    "Dashboard financiero con ingresos vs metas mensuales",
    "Reportes de ocupación por doctor y consultorio",
    "Análisis de origen de pacientes (Facebook, Google, referidos)",
    "Estadísticas demográficas por departamento y distrito",
    "Exportación a CSV para análisis externos",
  ],
  "retencion-pacientes": [
    "Dashboard de Lifetime Value por paciente",
    "Identificación automática de pacientes en riesgo",
    "Seguimientos automáticos por email a pacientes inactivos",
    "Emails de cumpleaños para mantener el vínculo",
    "Métricas de tasa de retorno y frecuencia de visitas",
  ],
  "gestion-equipo-medico": [
    "Roles predefinidos: owner, admin, recepcionista y doctor",
    "Permisos granulares por funcionalidad",
    "Horarios individuales por doctor y consultorio",
    "Restricciones automáticas para doctores según plan",
    "Auditoría de cambios con registro de quién hizo qué",
  ],
  "cobros-pagos-consultorio": [
    "Registra pagos por cita con múltiples métodos",
    "Soporte para efectivo, tarjeta, Yape, Plin y transferencias",
    "Control de saldos pendientes y deudas por paciente",
    "Envío automático de recibos por email",
    "Opción de enviar factura para pacientes con RUC",
  ],
};

// Use cases per feature
const FEATURE_USE_CASES: Record<string, { title: string; description: string }[]> = {
  "agenda-medica-online": [
    {
      title: "Consultorios independientes",
      description:
        "Un doctor que atiende en 1 o 2 consultorios y necesita organizar sus citas sin complicaciones.",
    },
    {
      title: "Centros médicos multiespecialidad",
      description:
        "Equipos con 3+ doctores que necesitan coordinar horarios, consultorios y servicios.",
    },
    {
      title: "Clínicas grandes",
      description:
        "Operaciones con 10+ doctores, recepcionistas y múltiples consultorios simultáneos.",
    },
  ],
};

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);

  if (!feature) {
    notFound();
  }

  const Icon = feature.icon;
  const benefits = FEATURE_BENEFITS[feature.slug] || [];
  const useCases =
    FEATURE_USE_CASES[feature.slug] || FEATURE_USE_CASES["agenda-medica-online"];
  const relatedFeatures = PRODUCT_FEATURES.filter(
    (f) => f.category === feature.category && f.slug !== feature.slug
  ).slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Breadcrumb */}
      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-5xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/producto" className="hover:text-emerald-600">
            Producto
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium">{feature.title}</span>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-8 pb-16 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 md:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-4">
                <Icon className="h-3.5 w-3.5" />
                {PRODUCT_CATEGORIES[feature.category]}
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                {feature.title}
              </h1>
              <p className="mt-4 text-lg md:text-xl text-slate-600 leading-relaxed">
                {feature.description}
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl gradient-primary px-5 text-sm font-semibold text-white shadow-md hover:opacity-90 transition-all"
                >
                  Prueba gratis
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/#pricing"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  Ver planes
                </Link>
              </div>
            </div>

            {/* Feature image placeholder */}
            <div className="aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-slate-200 mb-3">
                  <Icon className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-xs text-slate-400">Captura: {feature.title}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-6">
                Todo lo que necesitas para {feature.title.toLowerCase()}
              </h2>
              <ul className="space-y-4">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mt-0.5">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-base text-slate-700 leading-relaxed">
                      {benefit}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Secondary image placeholder */}
            <div className="aspect-[4/3] rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-slate-100 mb-3">
                  <svg
                    className="h-6 w-6 text-slate-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <p className="text-xs text-slate-400">Imagen secundaria</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 px-4 md:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Diseñado para tu tipo de práctica
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Desde doctores independientes hasta clínicas multidisciplinarias.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {useCases.map((useCase, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-4">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {useCase.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related features */}
      {relatedFeatures.length > 0 && (
        <section className="py-16 px-4 md:px-6 bg-slate-50">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Funcionalidades relacionadas
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {relatedFeatures.map((related) => {
                const RelatedIcon = related.icon;
                return (
                  <Link
                    key={related.slug}
                    href={`/producto/${related.slug}`}
                    className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-4">
                      <RelatedIcon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">
                      {related.title}
                    </h3>
                    <p className="text-sm text-slate-600 mb-3">{related.tagline}</p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                      Más información
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Empieza con {feature.title} hoy
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Prueba {APP_NAME} gratis por 14 días. Sin tarjeta de crédito.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl gradient-primary px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all"
            >
              Empezar prueba gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/producto"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Ver todas las funciones
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Inicio",
                item: "https://saas-orcin-seven.vercel.app/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Producto",
                item: "https://saas-orcin-seven.vercel.app/producto",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: feature.title,
                item: `https://saas-orcin-seven.vercel.app/producto/${feature.slug}`,
              },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: `${APP_NAME} — ${feature.title}`,
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            description: feature.metaDescription,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "PEN",
            },
          }),
        }}
      />
    </div>
  );
}
