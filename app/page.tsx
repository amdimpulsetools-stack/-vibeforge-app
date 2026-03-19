"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { APP_NAME } from "@/lib/constants";
import { Zap, ArrowRight, Shield, CalendarDays, Users, Activity } from "lucide-react";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Topbar ── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-md transition-transform group-hover:scale-105">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex h-9 items-center justify-center rounded-lg px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ingresar al panel
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg gradient-primary px-5 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
            >
              Crear cuenta
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/[0.07] blur-[120px]" />
          <div className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full bg-warm-accent/[0.05] blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <Activity className="h-3.5 w-3.5" />
              Gestión médica inteligente
            </div>

            {/* Title */}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Tu consultorio,{" "}
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                simplificado
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 text-lg text-muted-foreground sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Agenda citas, gestiona pacientes y haz crecer tu práctica médica
              con una plataforma todo-en-uno diseñada para profesionales de la
              salud.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl gradient-glow"
              >
                Empieza gratis — 14 días
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border/60 bg-card/50 px-8 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:border-border"
              >
                Ingresar al panel
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary/70" />
                <span>Datos encriptados</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary/70" />
                <span>14 días de prueba gratis</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary/70" />
                <span>Multi-sede y multi-usuario</span>
              </div>
            </div>
          </div>

          {/* Dashboard Preview Placeholder */}
          <div className="mt-16 mx-auto max-w-5xl">
            <div className="relative rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-1 shadow-2xl shadow-primary/[0.05]">
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-500/60" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                    <div className="h-3 w-3 rounded-full bg-green-500/60" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="rounded-md bg-muted/50 px-12 py-1 text-[10px] text-muted-foreground">
                      app.pacientespro.com
                    </div>
                  </div>
                </div>
                <div className="aspect-[16/9] bg-gradient-to-br from-card via-card to-muted/20 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <Zap className="h-8 w-8 text-primary/60" />
                    </div>
                    <p className="text-sm text-muted-foreground/60">
                      Vista previa del dashboard
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
