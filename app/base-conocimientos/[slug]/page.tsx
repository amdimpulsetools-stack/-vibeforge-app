import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { ChevronRight, ArrowLeft, Clock, Headphones } from "lucide-react";
import { KB_ARTICLES } from "@/lib/kb-data";
import { GuiaInicioRapido } from "./articles/guia-inicio-rapido";
import { ConfigurarWhatsApp } from "./articles/configurar-whatsapp";
import { NotasSOAP } from "./articles/notas-soap";
import { RolesPermisos } from "./articles/roles-permisos";
import { RegistrarPagos } from "./articles/registrar-pagos";
import { ReservaOnline } from "./articles/reserva-online";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const ARTICLE_COMPONENTS: Record<string, React.FC> = {
  "guia-inicio-rapido": GuiaInicioRapido,
  "configurar-recordatorios-whatsapp": ConfigurarWhatsApp,
  "notas-soap-plantillas": NotasSOAP,
  "roles-permisos": RolesPermisos,
  "registrar-pagos-deudas": RegistrarPagos,
  "reserva-online-pacientes": ReservaOnline,
};

export function generateStaticParams() {
  return KB_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = KB_ARTICLES.find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: `${article.title} | Base de conocimientos REPLACE`,
    description: article.desc,
  };
}


export default async function KBArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = KB_ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();

  const ArticleContent = ARTICLE_COMPONENTS[slug];
  const related = KB_ARTICLES.filter((a) => a.slug !== slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Breadcrumb */}
      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-3xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/base-conocimientos" className="hover:text-emerald-600">Base de conocimientos</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-emerald-700 font-medium">{article.categoryLabel}</span>
        </div>
      </nav>

      {/* Header */}
      <header className="pt-8 pb-6 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
              {article.categoryLabel}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {article.readTime}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            {article.title}
          </h1>
          <p className="mt-3 text-lg text-slate-600">{article.desc}</p>
        </div>
      </header>

      {/* Content */}
      <article className="px-4 md:px-6 pb-16">
        <div className="mx-auto max-w-3xl">
          {ArticleContent ? <ArticleContent /> : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <p className="text-sm text-amber-800 font-medium">Este artículo está en desarrollo.</p>
            </div>
          )}
        </div>
      </article>

      {/* Related */}
      <section className="py-12 px-4 md:px-6 bg-slate-50">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Otros artículos</h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link key={r.slug} href={`/base-conocimientos/${r.slug}`} className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-white transition-colors group">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700">{r.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{r.categoryLabel} · {r.readTime}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4 md:px-6 bg-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-xl font-bold text-white">¿Tienes más preguntas?</h2>
          <div className="mt-4">
            <Link href="/contacto" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
              <Headphones className="h-4 w-4" /> Contactar soporte
            </Link>
          </div>
        </div>
      </section>

      <div className="px-4 md:px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/base-conocimientos" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Volver a la base de conocimientos
          </Link>
        </div>
      </div>
    </div>
  );
}
