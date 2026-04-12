"use client";

import Link from "next/link";
import { ArrowRight, List } from "lucide-react";

interface BlogSidebarProps {
  headings: { id: string; text: string; level: number }[];
  slug: string;
}

export function BlogSidebar({ headings, slug }: BlogSidebarProps) {
  return (
    <div className="sticky top-24 space-y-6">
      {/* Author card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-lg font-bold text-emerald-700">
            R
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Equipo REPLACE</p>
            <p className="text-xs text-slate-500">Software médico para clínicas</p>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Contenido creado por profesionales en tecnología médica y gestión de clínicas en Latinoamérica.
        </p>
      </div>

      {/* Table of contents */}
      {headings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <List className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Contenidos</h3>
          </div>
          <nav className="space-y-1.5">
            {headings.filter(h => h.level === 2).map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className="block text-xs text-slate-600 hover:text-emerald-600 transition-colors leading-snug py-0.5"
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* CTA card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white">
        <h3 className="text-base font-bold mb-2">
          Genera más pacientes
        </h3>
        <p className="text-xs text-emerald-100 mb-4 leading-relaxed">
          Prueba REPLACE gratis y automatiza tu consultorio en minutos.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center justify-center gap-1.5 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          Empezar gratis
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Share */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Compartir post</h3>
        <div className="flex gap-2">
          {["LinkedIn", "X", "WhatsApp"].map((platform) => (
            <button
              key={platform}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {platform}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
