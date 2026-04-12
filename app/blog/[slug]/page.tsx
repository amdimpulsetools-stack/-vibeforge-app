import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, ArrowLeft, ChevronRight, Clock, Download } from "lucide-react";
import { BLOG_ARTICLES, getCategoryLabel } from "@/lib/blog-data";
import { BlogMarkdown } from "./blog-markdown";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function getPostContent(slug: string): { content: string; frontmatter: Record<string, unknown> } | null {
  const filePath = path.join(process.cwd(), "content", "blog", "posts", `${slug}.md`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { content, data } = matter(raw);
    return { content, frontmatter: data };
  } catch {
    return null;
  }
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

  const post = getPostContent(slug);
  const hasContent = post && post.content.trim().length > 100;

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
      <header className="pt-8 pb-8 px-4 md:px-6">
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
        </div>
      </header>

      {/* Article body */}
      <article className="px-4 md:px-6 pb-16">
        <div className="mx-auto max-w-3xl">
          {hasContent ? (
            <BlogMarkdown content={post.content} />
          ) : (
            <div className="prose prose-slate prose-emerald max-w-none">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-8">
                <p className="text-sm text-amber-800 font-medium mb-2">
                  Este artículo está en desarrollo
                </p>
                <p className="text-sm text-amber-700">
                  El contenido completo se publicará próximamente.
                </p>
              </div>
            </div>
          )}

          {/* Lead magnet CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-6 md:p-8 my-10">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Download className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Recurso gratuito
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Descarga un recurso práctico que complementa este artículo. Solo necesitas tu email.
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
                <p className="text-[10px] text-slate-400 mt-2">Sin spam. Solo contenido útil.</p>
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
                <Link key={r.slug} href={`/blog/${r.slug}`} className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {getCategoryLabel(r.category)}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-slate-900 group-hover:text-emerald-700 line-clamp-2 leading-snug">{r.title}</h3>
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
            <Link href="/register" className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
              Empezar ahora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="px-4 md:px-6 pb-12">
        <div className="mx-auto max-w-3xl">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Volver al blog
          </Link>
        </div>
      </div>

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
