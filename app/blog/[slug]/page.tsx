import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Navbar } from "@/components/landing/navbar";
import { ArrowRight, ArrowLeft, ChevronRight, Clock, Download, Share2, List } from "lucide-react";
import { BLOG_ARTICLES, getCategoryLabel } from "@/lib/blog-data";
import { BlogMarkdown } from "./blog-markdown";
import { BlogSidebar } from "./blog-sidebar";

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

function extractHeadings(content: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").trim();
      const id = text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      headings.push({ id, text, level });
    }
  }
  return headings;
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
  const headings = hasContent ? extractHeadings(post.content) : [];
  const leadMagnet = post?.frontmatter?.leadMagnet as { name?: string; cta?: string } | undefined;

  const related = BLOG_ARTICLES
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ════════════════════════════════════════════════ */}
      {/* HERO — Full width colored header (Kommo style)  */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-16 bg-gradient-to-b from-emerald-50 to-white">
        <div className="mx-auto max-w-5xl px-4 md:px-6 pt-16 pb-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-emerald-600">Inicio</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/blog" className="hover:text-emerald-600">Blog</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-emerald-700 font-medium">{getCategoryLabel(article.category)}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-slate-900 leading-[1.1] max-w-4xl">
            {article.title}
          </h1>

          <div className="flex items-center gap-4 mt-6 text-sm text-slate-500">
            <span>{new Date(article.date + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {article.readTime}
            </span>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* CONTENT + SIDEBAR (2-column Kommo layout)       */}
      {/* ════════════════════════════════════════════════ */}
      <section className="px-4 md:px-6 pb-16">
        <div className="mx-auto max-w-5xl">
          {/* Back + Share bar */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <Link href="/blog" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-emerald-600 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Posts
            </Link>
            <button className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
              Compartir
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
            {/* Main content */}
            <article>
              {hasContent ? (
                <BlogMarkdown content={post.content} />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-8">
                  <p className="text-sm text-amber-800 font-medium mb-2">Este artículo está en desarrollo</p>
                  <p className="text-sm text-amber-700">El contenido completo se publicará próximamente.</p>
                </div>
              )}

              {/* Inline lead magnet (after content) */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-6 md:p-8 mt-12">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Download className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">
                      {leadMagnet?.name || "Recurso gratuito"}
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Descarga un recurso práctico que complementa este artículo.
                    </p>
                    <div className="flex flex-col sm:flex-row items-start gap-2">
                      <input type="email" placeholder="tu@email.com" className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">
                        <Download className="h-4 w-4" />
                        {leadMagnet?.cta || "Descargar gratis"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            {/* Sidebar (sticky) */}
            <aside className="hidden lg:block">
              <BlogSidebar headings={headings} slug={slug} />
            </aside>
          </div>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="py-12 px-4 md:px-6 bg-slate-50">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Artículos relacionados</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link key={r.slug} href={`/blog/${r.slug}`} className="group rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-all">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{getCategoryLabel(r.category)}</span>
                  <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-emerald-700 line-clamp-2 leading-snug">{r.title}</h3>
                  <p className="mt-2 text-xs text-slate-500 line-clamp-2">{r.excerpt}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    Leer más <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-12 px-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 md:p-12 text-center text-white shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold">Prueba REPLACE gratis 14 días</h2>
            <p className="mt-2 text-emerald-100">Agenda, historia clínica, recetas, reportes y más.</p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/register" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors w-full sm:w-auto">
                Empezar ahora <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.excerpt, datePublished: article.date, author: { "@type": "Organization", name: "REPLACE" }, publisher: { "@type": "Organization", name: "REPLACE" } }) }} />
    </div>
  );
}
