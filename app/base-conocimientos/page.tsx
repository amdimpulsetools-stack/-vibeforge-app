"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import {
  Search, Rocket, Settings, CalendarDays, Users, FileText,
  MessageCircle, BarChart3, Shield, Clock, ChevronRight,
  Headphones, ArrowRight,
} from "lucide-react";

const CATEGORIES = [
  { icon: Rocket, label: "Cómo empezar", slug: "como-empezar", desc: "Configuración inicial y primeros pasos" },
  { icon: Settings, label: "Ajustes de cuenta", slug: "ajustes-cuenta", desc: "Organización, perfil y preferencias" },
  { icon: CalendarDays, label: "Agenda y citas", slug: "agenda-citas", desc: "Calendario, reservas y recordatorios" },
  { icon: Users, label: "Pacientes", slug: "pacientes", desc: "Fichas, seguimientos y etiquetas" },
  { icon: FileText, label: "Historia clínica", slug: "historia-clinica", desc: "SOAP, recetas, exámenes y plantillas" },
  { icon: MessageCircle, label: "Comunicación", slug: "comunicacion", desc: "WhatsApp, emails y notificaciones" },
  { icon: BarChart3, label: "Reportes", slug: "reportes", desc: "Dashboards, KPIs y exportaciones" },
  { icon: Shield, label: "Seguridad y roles", slug: "seguridad-roles", desc: "Permisos, miembros y privacidad" },
];

const POPULAR_SEARCHES = [
  "agenda", "WhatsApp", "SOAP", "recordatorios", "recetas", "cobros",
];

const FEATURED_ARTICLES = [
  {
    title: "Comienza con REPLACE: guía de inicio rápido",
    desc: "Aprende a configurar tu cuenta, agregar doctores, crear servicios y agendar tu primera cita en menos de 10 minutos.",
    category: "como-empezar",
    readTime: "4 min",
  },
  {
    title: "Cómo configurar recordatorios por WhatsApp",
    desc: "Conecta WhatsApp Business API y activa recordatorios automáticos 24h y 2h antes de cada cita.",
    category: "comunicacion",
    readTime: "5 min",
  },
  {
    title: "Crear notas clínicas SOAP con plantillas",
    desc: "Usa el editor SOAP con autocompletado CIE-10, signos vitales y plantillas reutilizables por especialidad.",
    category: "historia-clinica",
    readTime: "6 min",
  },
  {
    title: "Gestionar roles y permisos del equipo",
    desc: "Configura los 4 roles (Owner, Admin, Recepcionista, Doctor) y define qué puede ver y hacer cada uno.",
    category: "seguridad-roles",
    readTime: "4 min",
  },
  {
    title: "Registrar pagos y controlar deudas",
    desc: "Cómo registrar pagos por cita, visualizar saldos pendientes y enviar recibos automáticos por email.",
    category: "reportes",
    readTime: "5 min",
  },
  {
    title: "Configurar la reserva online para pacientes",
    desc: "Genera un link público donde tus pacientes reservan 24/7. Sincronización automática con tu agenda.",
    category: "agenda-citas",
    readTime: "4 min",
  },
];

export default function BaseConocimientosPage() {
  const [search, setSearch] = useState("");

  const filteredArticles = search.trim()
    ? FEATURED_ARTICLES.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.desc.toLowerCase().includes(search.toLowerCase())
      )
    : FEATURED_ARTICLES;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-16 bg-gradient-to-b from-emerald-50 via-teal-50/50 to-white">
        <div className="mx-auto max-w-3xl px-4 md:px-6 pt-16 pb-14 text-center">
          <p className="text-sm font-semibold text-emerald-700 mb-2">Base de Conocimientos</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900">
            Estamos aquí para ayudarte
          </h1>

          {/* Search */}
          <div className="mt-8 mx-auto max-w-lg">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 py-3.5 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-300 transition-all"
              />
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>Búsquedas populares:</span>
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  onClick={() => setSearch(term)}
                  className="text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories grid */}
      <section className="py-12 px-4 md:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.slug}
                  onClick={() => setSearch(cat.label)}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 text-center hover:border-emerald-300 hover:shadow-lg transition-all"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors mb-3">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{cat.label}</h3>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured articles */}
      <section className="py-12 px-4 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-slate-900 mb-8">
            {search.trim() ? `Resultados para "${search}"` : "Artículos destacados"}
          </h2>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-10 w-10 text-slate-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-700">No encontramos resultados</p>
              <p className="text-sm text-slate-500 mt-1">Intenta con otra búsqueda o contacta a soporte</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredArticles.map((article, idx) => {
                const catInfo = CATEGORIES.find((c) => c.slug === article.category);
                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-4 rounded-xl px-4 py-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {article.title}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {article.desc}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {catInfo && (
                        <span className="hidden sm:inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                          {catInfo.label}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {article.readTime}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 md:px-6 bg-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            ¿Tienes más preguntas?
          </h2>
          <p className="mt-3 text-slate-400">
            Nuestro equipo de soporte está disponible para ayudarte.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contacto"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 px-6 text-sm font-semibold text-white hover:bg-slate-800 transition-all w-full sm:w-auto"
            >
              <Headphones className="h-4 w-4" />
              Contactar soporte
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
