import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PRODUCT_FEATURES } from "@/lib/product-features";
import { Reveal } from "@/components/landing/reveal";

export const metadata: Metadata = {
  title: `Producto — Software Médico Todo en Uno | REPLACE`,
  description:
    "Descubre todas las funcionalidades de REPLACE: agenda médica online, historia clínica electrónica, recetas digitales, recordatorios por WhatsApp, reportes, asistente IA y más. Software para clínicas y consultorios.",
  keywords: [
    "software para consultorio médico",
    "software para clínica",
    "software médico todo en uno",
    "plataforma para clínicas",
    "sistema de gestión médica",
  ],
  openGraph: {
    title: `Producto — Software Médico Todo en Uno | REPLACE`,
    description:
      "Todas las herramientas que necesita tu clínica en un solo lugar: agenda, historia clínica, recetas, reportes y más.",
    type: "website",
  },
  alternates: {
    canonical: "/producto",
  },
};

export default function ProductOverviewPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 md:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 mb-6">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Plataforma todo en uno para clínicas y consultorios
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Todo lo que tu clínica necesita,
            <br className="hidden md:block" />
            <span className="gradient-text-emerald"> en un solo lugar</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Desde la primera cita hasta la retención de pacientes: REPLACE unifica
            agenda, historia clínica, recetas, cobros y reportes en una plataforma
            diseñada para médicos latinoamericanos.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl gradient-primary px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all"
            >
              Prueba gratis 14 días
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/#pricing"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Ver planes
            </Link>
          </div>
        </div>

        {/* Hero image placeholder */}
        <div className="mx-auto max-w-5xl mt-16">
          <div className="aspect-[16/9] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-slate-200 mb-4">
                <svg
                  className="h-8 w-8 text-slate-400"
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
              <p className="text-sm text-slate-400">Screenshot del dashboard</p>
            </div>
          </div>
        </div>
      </section>

      {/* All features */}
      <section className="py-16 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              7 módulos. Una sola plataforma.
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Todo lo que necesitas para gestionar tu clínica, sin cambiar de herramienta.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.slug} delay={idx * 80}>
                <Link
                  href={`/producto/${feature.slug}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all block h-full"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-3">
                    {feature.description}
                  </p>
                  {feature.includes && (
                    <ul className="mb-4 space-y-1">
                      {feature.includes.map((inc) => (
                        <li key={inc} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          {inc}
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                    Más información
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Listo para modernizar tu clínica?
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Prueba REPLACE gratis por 14 días. Sin tarjeta de crédito.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl gradient-primary px-6 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all"
            >
              Empezar prueba gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "REPLACE",
            applicationCategory: "MedicalApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "PEN",
            },
            description:
              "Software todo en uno para clínicas y consultorios médicos en Latinoamérica. Agenda, historia clínica, recetas, reportes y más.",
            featureList: PRODUCT_FEATURES.map((f) => f.title).join(", "),
          }),
        }}
      />
    </div>
  );
}
