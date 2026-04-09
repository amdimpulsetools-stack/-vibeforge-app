"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { APP_NAME } from "@/lib/constants";
import {
  ArrowRight,
  Play,
  Calendar,
  Users,
  Shield,
  BarChart3,
  Bell,
  Search,
  Plus,
  ChevronDown,
  Clock,
  Stethoscope,
} from "lucide-react";

export function Hero() {
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dashboardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Background effects - light mode */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-emerald-100/40 blur-[120px]" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full bg-amber-100/30 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-emerald-50/50 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 opacity-0 animate-[fadeUp_0.5s_0.1s_ease-out_forwards]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Lanzamiento 2026 — Acceso anticipado disponible
          </div>

          {/* Title */}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-slate-900 opacity-0 animate-[fadeUp_0.6s_0.2s_ease-out_forwards]">
            Tu clínica completa.{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              En una sola plataforma.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg text-slate-600 sm:text-xl max-w-2xl mx-auto leading-relaxed opacity-0 animate-[fadeUp_0.6s_0.35s_ease-out_forwards]">
            Agenda inteligente, gestión de pacientes, control de equipo y
            asistente con IA. Desde el doctor independiente hasta la clínica
            con 10 consultorios. Planes desde S/69.90/mes.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-[fadeUp_0.6s_0.5s_ease-out_forwards]">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Empezar ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-8 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              <Play className="h-4 w-4 mr-2 text-emerald-600" />
              Ver cómo funciona
            </a>
          </div>

          {/* Trust line */}
          <p className="mt-5 text-sm text-slate-400 opacity-0 animate-[fadeUp_0.5s_0.65s_ease-out_forwards]">
            Sin contratos. Cancela cuando quieras. Configura tu clínica en minutos.
          </p>
        </div>

        {/* ── CSS Dashboard Mockup ── */}
        <div
          ref={dashboardRef}
          className="mt-16 mx-auto max-w-5xl opacity-0 translate-y-8 transition-all duration-700 ease-out [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
        >
          <div className="relative rounded-2xl border border-slate-200/60 bg-white/50 backdrop-blur-sm p-1.5 shadow-2xl shadow-slate-200/50">
            <div className="rounded-xl border border-slate-200/50 bg-white overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/80">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="rounded-md bg-slate-100 px-12 py-1 text-[10px] text-slate-400 flex items-center gap-1.5">
                    <Shield className="h-2.5 w-2.5" />
                    app.{APP_NAME.toLowerCase()}.com
                  </div>
                </div>
              </div>

              {/* Dashboard UI */}
              <div className="flex min-h-[340px] sm:min-h-[420px]">
                {/* Sidebar */}
                <div className="hidden sm:flex w-52 border-r border-slate-100 bg-slate-50/50 flex-col p-3 gap-1">
                  <div className="flex items-center gap-2 px-2 py-2 mb-3">
                    <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
                      <Stethoscope className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Mi Clínica</span>
                  </div>
                  {[
                    { icon: Calendar, label: "Agenda", active: true },
                    { icon: Users, label: "Pacientes", active: false },
                    { icon: BarChart3, label: "Reportes", active: false },
                    { icon: Shield, label: "Equipo", active: false },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        item.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 p-4 sm:p-5">
                  {/* Top bar */}
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Agenda de hoy</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Martes, 24 de marzo</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-400">
                        <Search className="h-3 w-3" />
                        Buscar paciente...
                      </div>
                      <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
                        <Plus className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="relative h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Bell className="h-3.5 w-3.5 text-slate-500" />
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-400 border border-white" />
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: "Citas hoy", value: "12", color: "bg-emerald-50 text-emerald-700" },
                      { label: "Pacientes nuevos", value: "3", color: "bg-blue-50 text-blue-700" },
                      { label: "Completadas", value: "7", color: "bg-amber-50 text-amber-700" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-slate-100 bg-white p-2.5 sm:p-3"
                      >
                        <p className="text-[10px] text-slate-400">{stat.label}</p>
                        <p className={`text-lg sm:text-xl font-bold mt-0.5 ${stat.color} rounded-md inline-block px-1`}>
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Appointment list */}
                  <div className="space-y-2">
                    {[
                      { time: "9:00", patient: "María García", service: "Control general", status: "confirmed" },
                      { time: "9:30", patient: "Carlos López", service: "Ecografía", status: "confirmed" },
                      { time: "10:00", patient: "Ana Rodríguez", service: "Consulta dental", status: "pending" },
                      { time: "10:30", patient: "Pedro Martínez", service: "Dermatología", status: "confirmed" },
                    ].map((apt) => (
                      <div
                        key={apt.time}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-2.5 hover:border-emerald-200 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 w-12">
                          <Clock className="h-3 w-3" />
                          {apt.time}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{apt.patient}</p>
                          <p className="text-[10px] text-slate-400 truncate">{apt.service}</p>
                        </div>
                        <span
                          className={`hidden sm:inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            apt.status === "confirmed"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {apt.status === "confirmed" ? "Confirmada" : "Pendiente"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
