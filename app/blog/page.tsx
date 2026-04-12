"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { Search, ArrowRight, Clock, ChevronRight } from "lucide-react";
import {
  BLOG_CATEGORIES,
  BLOG_ARTICLES,
  getFeaturedArticles,
  getArticlesByCategory,
  getCategoryLabel,
} from "@/lib/blog-data";
import { cn } from "@/lib/utils";

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");

  const featured = getFeaturedArticles();
  const categoryArticles = getArticlesByCategory(activeCategory);

  const filteredArticles = searchQuery.trim()
    ? categoryArticles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : categoryArticles;

  // Best-of grouped by category (for the bottom section)
  const bestOfCategories = [
    {
      label: "Agenda médica",
      links: BLOG_ARTICLES.filter((a) => a.category === "agenda").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
    {
      label: "Historia clínica",
      links: BLOG_ARTICLES.filter((a) => a.category === "historia-clinica").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
    {
      label: "Gestión de clínicas",
      links: BLOG_ARTICLES.filter((a) => a.category === "gestion").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
    {
      label: "WhatsApp y Marketing",
      links: BLOG_ARTICLES.filter((a) => a.category === "whatsapp" || a.category === "marketing").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
    {
      label: "IA y Tecnología",
      links: BLOG_ARTICLES.filter((a) => a.category === "ia" || a.category === "seguridad").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
    {
      label: "Reportes",
      links: BLOG_ARTICLES.filter((a) => a.category === "reportes").map((a) => ({
        title: a.title,
        slug: a.slug,
      })),
    },
  ].filter((c) => c.links.length > 0);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ════════════════════════════════════════════════ */}
      {/* HERO                                            */}
      {/* ════════════════════════════════════════════════ */}
      <section className="pt-28 pb-8 px-4 md:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Bienvenido al blog de REPLACE
          </h1>

          {/* Search bar */}
          <div className="mt-8 mx-auto max-w-xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar artículos..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 py-3.5 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-300 transition-all"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {BLOG_CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => { setActiveCategory(cat.slug); setSearchQuery(""); }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  activeCategory === cat.slug
                    ? "bg-emerald-600 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* FEATURED ARTICLES (only when on "todos")        */}
      {/* ════════════════════════════════════════════════ */}
      {activeCategory === "todos" && !searchQuery.trim() && featured.length > 0 && (
        <section className="py-8 px-4 md:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Main featured */}
              <Link
                href={`/blog/${featured[0].slug}`}
                className="group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 hover:shadow-xl transition-all"
              >
                {/* Image placeholder */}
                <div className="aspect-[16/10] bg-gradient-to-br from-emerald-100 to-teal-50 flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm mb-2">
                      <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-400">{featured[0].imageAlt}</p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {getCategoryLabel(featured[0].category)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      {featured[0].readTime}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-tight">
                    {featured[0].title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3 leading-relaxed">
                    {featured[0].excerpt}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                    Leer más <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>

              {/* Secondary featured */}
              <div className="space-y-6">
                {featured.slice(1, 3).map((article) => (
                  <Link
                    key={article.slug}
                    href={`/blog/${article.slug}`}
                    className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-lg transition-all"
                  >
                    {/* Mini image placeholder */}
                    <div className="shrink-0 w-32 h-24 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                      <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {getCategoryLabel(article.category)}
                        </span>
                        <span className="text-[10px] text-slate-400">{article.readTime}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {article.excerpt}
                      </p>
                    </div>
                  </Link>
                ))}

                {/* "Show all" button */}
                <button
                  onClick={() => setActiveCategory("todos")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Mostrar todos los posts
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ARTICLE GRID                                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-10 px-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          {searchQuery.trim() && (
            <p className="text-sm text-slate-500 mb-4">
              {filteredArticles.length} resultado{filteredArticles.length !== 1 ? "s" : ""} para &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {filteredArticles.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-slate-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-700">No encontramos artículos</p>
              <p className="text-sm text-slate-500 mt-1">
                Intenta con otra búsqueda o selecciona una categoría diferente
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(activeCategory === "todos" && !searchQuery.trim()
                ? filteredArticles.filter((a) => !a.featured)
                : filteredArticles
              ).map((article) => (
                <Link
                  key={article.slug}
                  href={`/blog/${article.slug}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-emerald-200 transition-all"
                >
                  {/* Image placeholder */}
                  <div className="aspect-[16/9] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                    <svg className="h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {getCategoryLabel(article.category)}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {article.readTime}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug line-clamp-2 mb-2">
                      {article.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                      {article.excerpt}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* BEST OF — Category link lists (Kommo style)     */}
      {/* ════════════════════════════════════════════════ */}
      {activeCategory === "todos" && !searchQuery.trim() && (
        <section className="py-16 px-4 md:px-6 bg-slate-50">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                Lo mejor del Blog de REPLACE
              </h2>
              {/* Decorative placeholder */}
              <div className="hidden md:flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {bestOfCategories.map((cat) => (
                <div key={cat.label}>
                  <h3 className="text-base font-bold text-slate-900 mb-3">{cat.label}</h3>
                  <ul className="space-y-2">
                    {cat.links.map((link) => (
                      <li key={link.slug}>
                        <Link
                          href={`/blog/${link.slug}`}
                          className="group flex items-start gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 transition-colors"
                        >
                          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                          <span className="leading-snug">{link.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* CTA BANNER                                      */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-16 px-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-12 md:px-16 md:py-14 text-center text-white shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold">
              Prueba REPLACE gratis durante 14 días
            </h2>
            <p className="mt-3 text-emerald-100 max-w-xl mx-auto">
              Prueba REPLACE por ti mismo o agenda una demo gratuita.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-md hover:bg-emerald-50 transition-all w-full sm:w-auto"
              >
                Prueba gratis
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 px-6 text-sm font-semibold text-white hover:bg-white/10 transition-all w-full sm:w-auto"
              >
                Obtén una demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Blog de REPLACE",
            description: "Artículos sobre gestión de clínicas médicas, agenda online, historia clínica electrónica, marketing médico e inteligencia artificial para consultorios.",
            url: "https://REPLACE.com/blog",
          }),
        }}
      />
    </div>
  );
}
