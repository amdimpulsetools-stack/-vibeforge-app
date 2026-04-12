import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, ArrowLeft, ChevronRight, Clock, Download } from "lucide-react";
import { BLOG_ARTICLES, getCategoryLabel } from "@/lib/blog-data";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return BLOG_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((a) => a.slug === slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.excerpt,
    openGraph: { title: article.title, description: article.excerpt, type: "article" },
    alternates: { canonical: `/blog/${article.slug}` },
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((a) => a.slug === slug);

  if (!article) notFound();

  // Find related articles (same category, exclude current)
  const related = BLOG_ARTICLES
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Breadcrumb */}
      <nav className="pt-24 px-4 md:px-6" aria-label="Breadcrumb">
        <div className="mx-auto max-w-3xl flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-emerald-600">Inicio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/blog" className="hover:text-emerald-600">Blog</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-900 font-medium truncate">{article.title}</span>
        </div>
      </nav>

      {/* Article header */}
      <header className="pt-8 pb-12 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
              {getCategoryLabel(article.category)}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {article.readTime}
            </span>
            <span className="text-xs text-slate-400">{article.date}</span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            {article.title}
          </h1>

          <p className="mt-4 text-lg text-slate-600 leading-relaxed">
            {article.excerpt}
          </p>

          {/* Hero image placeholder */}
          <div className="mt-8 aspect-[16/9] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <div className="text-center">
              <svg className="h-10 w-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-xs text-slate-400">Imagen del artículo</p>
            </div>
          </div>
        </div>
      </header>

      {/* Article body placeholder — content will come from markdown */}
      <article className="px-4 md:px-6 pb-16">
        <div className="mx-auto max-w-3xl prose prose-slate prose-emerald prose-headings:tracking-tight prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-8">
            <p className="text-sm text-amber-800 font-medium mb-2">
              Este artículo está en desarrollo
            </p>
            <p className="text-sm text-amber-700">
              El contenido completo de este artículo se publicará próximamente.
              El equipo de REPLACE está preparando contenido de alta calidad
              basado en datos reales del mercado médico peruano.
            </p>
          </div>

          {/* Lead magnet CTA */}
          <div className="not-prose rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-6 md:p-8 my-10">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Recurso gratuito relacionado
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Descarga un recurso práctico que complementa este artículo.
                  Solo necesitas tu email para recibirlo.
                </p>
                <div className="flex flex-col sm:flex-row items-start gap-2">
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">
                    <Download className="h-4 w-4" />
                    Descargar gratis
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Sin spam. Solo contenido útil para tu consultorio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Related articles */}
      {related.length > 0 && (
        <section className="py-12 px-4 md:px-6 bg-slate-50">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Artículos relacionados</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all"
                >
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {getCategoryLabel(r.category)}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-slate-900 group-hover:text-emerald-700 line-clamp-2 leading-snug">
                    {r.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{r.readTime}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-12 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 md:p-12 text-center text-white">
            <h2 className="text-2xl font-bold">Prueba REPLACE gratis 14 días</h2>
            <p className="mt-2 text-emerald-100">Agenda, historia clínica, recetas, reportes y más. Sin tarjeta de crédito.</p>
            <Link
              href="/register"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Empezar ahora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Back to blog */}
      <div className="px-4 md:px-6 pb-12">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al blog
          </Link>
        </div>
      </div>

      {/* Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.excerpt,
            datePublished: article.date,
            author: { "@type": "Organization", name: "REPLACE" },
            publisher: { "@type": "Organization", name: "REPLACE" },
          }),
        }}
      />
    </div>
  );
}
