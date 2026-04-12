"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { APP_NAME } from "@/lib/constants";
import { Zap, ArrowRight, Menu, X, ChevronDown, Sparkles } from "lucide-react";
import { PRODUCT_FEATURES } from "@/lib/product-features";

const SIMPLE_LINKS = [
  { label: "Planes", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [mobileProductOpen, setMobileProductOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-md transition-transform group-hover:scale-105">
            <Zap className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            {APP_NAME}
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {/* Producto dropdown */}
          <div ref={productRef} className="relative">
            <button
              onClick={() => setProductOpen(!productOpen)}
              onMouseEnter={() => setProductOpen(true)}
              className="flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-600"
              aria-expanded={productOpen}
            >
              Producto
              <ChevronDown
                className={`h-4 w-4 transition-transform ${productOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Mega menu panel — full width */}
            {productOpen && (
              <div
                onMouseLeave={() => setProductOpen(false)}
                className="fixed left-0 right-0 top-16 z-50 border-b border-slate-200 bg-white shadow-2xl"
              >
                <div className="mx-auto max-w-7xl">
                  <div className="grid grid-cols-3 gap-0">
                    {/* Columna 1: Features 1-3 */}
                    <div className="p-6 border-r border-slate-100 space-y-3">
                      {PRODUCT_FEATURES.slice(0, 3).map((feature) => {
                        const Icon = feature.icon;
                        return (
                          <Link
                            key={feature.slug}
                            href={`/producto/${feature.slug}`}
                            onClick={() => setProductOpen(false)}
                            className="group/item flex items-start gap-3 rounded-lg p-2.5 -m-1 hover:bg-emerald-50/50 transition-colors"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-colors">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                {feature.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                {feature.tagline}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    {/* Columna 2: Features 4-6 */}
                    <div className="p-6 border-r border-slate-100 space-y-3">
                      {PRODUCT_FEATURES.slice(3, 6).map((feature) => {
                        const Icon = feature.icon;
                        return (
                          <Link
                            key={feature.slug}
                            href={`/producto/${feature.slug}`}
                            onClick={() => setProductOpen(false)}
                            className="group/item flex items-start gap-3 rounded-lg p-2.5 -m-1 hover:bg-emerald-50/50 transition-colors"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-colors">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                {feature.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                {feature.tagline}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    {/* Columna 3: Feature 7 + Highlight IA */}
                    <div className="p-6 space-y-4">
                      {PRODUCT_FEATURES.slice(6).map((feature) => {
                        const Icon = feature.icon;
                        return (
                          <Link
                            key={feature.slug}
                            href={`/producto/${feature.slug}`}
                            onClick={() => setProductOpen(false)}
                            className="group/item flex items-start gap-3 rounded-lg p-2.5 -m-1 hover:bg-emerald-50/50 transition-colors"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover/item:bg-emerald-600 group-hover/item:text-white transition-colors">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-tight">
                                {feature.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                {feature.tagline}
                              </p>
                            </div>
                          </Link>
                        );
                      })}

                      {/* IA Highlight card */}
                      <div className="mt-2 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-xs font-bold text-violet-700">Nuevo</span>
                        </div>
                        <p className="text-xs text-slate-600 mb-2">
                          Pregúntale a tu clínica cuánto facturaste, tus pacientes frecuentes y más.
                        </p>
                        <Link
                          href="/producto/asistente-ia-consultorio"
                          onClick={() => setProductOpen(false)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900 transition-colors"
                        >
                          Ver Asistente IA
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Footer bar */}
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-3">
                  <Link
                    href="/producto"
                    onClick={() => setProductOpen(false)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-emerald-600 transition-colors"
                  >
                    Ver todas las funcionalidades
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Simple links */}
          {SIMPLE_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-emerald-600"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-lg px-5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            Ingresar
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg gradient-primary px-5 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
          >
            Empezar ahora
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-6 py-4 space-y-1">
            {/* Producto collapsible */}
            <button
              onClick={() => setMobileProductOpen(!mobileProductOpen)}
              className="flex w-full items-center justify-between py-2 text-sm font-medium text-slate-700"
            >
              Producto
              <ChevronDown
                className={`h-4 w-4 transition-transform ${mobileProductOpen ? "rotate-180" : ""}`}
              />
            </button>
            {mobileProductOpen && (
              <div className="pl-3 pb-2 space-y-2 border-l-2 border-emerald-200 ml-1 mt-1">
                {PRODUCT_FEATURES.map((feature) => (
                  <Link
                    key={feature.slug}
                    href={`/producto/${feature.slug}`}
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileProductOpen(false);
                    }}
                    className="block py-1.5 text-sm text-slate-600 hover:text-emerald-600"
                  >
                    {feature.title}
                  </Link>
                ))}
                <Link
                  href="/producto"
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileProductOpen(false);
                  }}
                  className="block py-2 text-sm font-semibold text-emerald-600"
                >
                  Ver todas las funcionalidades →
                </Link>
              </div>
            )}

            {SIMPLE_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block text-sm font-medium text-slate-700 py-2"
              >
                {link.label}
              </a>
            ))}

            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 py-2"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-primary px-5 text-sm font-semibold text-white shadow-md"
              >
                Empezar ahora
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
