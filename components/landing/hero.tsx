"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Calculator,
  Calendar,
  Shield,
  BarChart3,
  Bell,
  Plus,
  Sparkles,
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
        <div className="absolute top-0 left-1/2 -translate-x-1/2 hidden sm:block w-[700px] h-[480px] rounded-full bg-emerald-100/40 blur-[120px]" />
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
            Prueba 14 días gratis · Sin tarjeta · Desde S/129 al mes
          </div>

          {/* Title */}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-slate-900 opacity-0 animate-[fadeUp_0.6s_0.2s_ease-out_forwards]">
            Tu clínica no se cae por falta de pacientes. Se cae entre{" "}
            <span className="agenda-inteligente bg-clip-text text-transparent">
              el Excel, el cuaderno y tu WhatsApp
            </span>
            .
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg text-slate-600 sm:text-xl max-w-2xl mx-auto leading-relaxed opacity-0 animate-[fadeUp_0.6s_0.35s_ease-out_forwards]">
            Yenda junta la agenda, la historia clínica, la caja, la boleta
            SUNAT y los recordatorios de WhatsApp en una sola pantalla. Tu
            recepcionista deja de copiar datos de un lado a otro y tú dejas de
            perder plata por citas que nadie confirmó.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-[fadeUp_0.6s_0.5s_ease-out_forwards]">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Empezar mis 14 días gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#revenue-impact"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-8 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              <Calculator className="h-4 w-4 mr-2 text-emerald-600" />
              Calcula cuánto pierdes hoy
            </a>
          </div>

          {/* Trust line */}
          <p className="mt-5 text-sm text-slate-500 opacity-0 animate-[fadeUp_0.5s_0.65s_ease-out_forwards]">
            Sin tarjeta. Sin contrato. Lo configuras en una tarde y tu
            recepcionista lo entiende el mismo día.
          </p>
        </div>

        {/* ── Mockup: agenda con 2 consultorios + sidebar de cita ──
            Réplica fiel del scheduler real (pedido del founder, 2026-08-21)
            hasta tener una captura del producto. Las 3 tarjetas flotantes
            RECTAS enseñan los diferenciales: IA, seguimientos y analítica
            por distrito. En móvil las flotantes se apilan debajo. */}
        <div
          ref={dashboardRef}
          className="relative mt-16 mx-auto max-w-5xl opacity-0 translate-y-8 transition-all duration-700 ease-out [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
        >
          <div className="rounded-2xl border border-slate-200/60 bg-white/50 backdrop-blur-sm p-1.5 shadow-2xl shadow-slate-200/50">
            <div className="rounded-xl border border-slate-200/50 bg-white overflow-hidden">
              {/* Barra del navegador */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/80">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white border border-slate-200 px-3 py-1 text-[11px] text-slate-500">
                  <Shield className="h-3 w-3 text-emerald-500" />
                  app.yenda.app/scheduler
                </div>
              </div>

              <div className="flex">
                {/* Agenda del día */}
                <div className="flex-1 min-w-0 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-800">
                        Agenda — Hoy
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      En vivo
                    </span>
                  </div>

                  {/* Cabecera de consultorios */}
                  <div className="grid grid-cols-[44px_1fr_1fr] gap-1.5 mb-1.5">
                    <div />
                    {["Consultorio 1", "Consultorio 2"].map((c) => (
                      <div key={c} className="rounded-md bg-slate-50 border border-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 text-center truncate">
                        {c}
                      </div>
                    ))}
                  </div>

                  {/* Filas de la grilla */}
                  {[
                    {
                      time: "09:00",
                      a: { p: "María Torres", s: "Limpieza facial", st: "confirmada" },
                      b: { p: "Jorge Salas", s: "Control", st: "en-consulta" },
                    },
                    {
                      time: "09:30",
                      a: null,
                      b: { p: "Ana Mendoza", s: "Toxina botulínica", st: "confirmada" },
                    },
                    {
                      time: "10:00",
                      a: { p: "Carlos Ríos", s: "1era consulta", st: "pendiente" },
                      b: null,
                    },
                  ].map((row) => (
                    <div key={row.time} className="grid grid-cols-[44px_1fr_1fr] gap-1.5 mb-1.5">
                      <div className="flex items-start justify-end pr-1 pt-1 text-[10px] tabular-nums text-slate-400">
                        {row.time}
                      </div>
                      {[row.a, row.b].map((cell, i) =>
                        cell ? (
                          <div
                            key={i}
                            className={`rounded-lg border-l-[3px] px-2 py-1.5 ${
                              cell.st === "confirmada"
                                ? "bg-emerald-50/80 border-emerald-500"
                                : cell.st === "en-consulta"
                                  ? "bg-sky-50/80 border-sky-500"
                                  : "bg-amber-50/80 border-amber-400"
                            }`}
                          >
                            <p className="text-[11px] font-semibold text-slate-800 truncate">
                              {cell.p}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">{cell.s}</p>
                          </div>
                        ) : (
                          <div key={i} className="rounded-lg border border-dashed border-slate-200 flex items-center justify-center py-1.5">
                            <Plus className="h-3 w-3 text-slate-300" />
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>

                {/* Sidebar de la cita seleccionada (como en el producto) */}
                <div className="hidden sm:flex w-52 shrink-0 flex-col border-l border-slate-100 bg-slate-50/60 p-3 gap-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Cita seleccionada
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">Ana Mendoza</p>
                    <p className="text-[11px] text-slate-500">Toxina botulínica · 09:30</p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Confirmada por WhatsApp
                  </span>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Servicio</span>
                      <span className="font-semibold text-slate-800 tabular-nums">S/ 850</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Pagado</span>
                      <span className="font-semibold text-emerald-600 tabular-nums">S/ 850</span>
                    </div>
                  </div>
                  <div className="mt-auto rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-semibold text-white">
                    Iniciar consulta
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tarjetas flotantes (rectas) — solo desktop; en móvil se apilan ── */}
          {/* IA */}
          <div className="hero-float-card hidden lg:block absolute -top-8 -right-16 w-60 rounded-2xl border border-slate-200 bg-white shadow-2xl p-3.5 z-20" style={{ "--float-delay": "0.8s" } as React.CSSProperties}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <Sparkles className="h-3 w-3" /> Asistente IA
            </p>
            <div className="mt-2 flex justify-end">
              <div className="rounded-xl rounded-br-sm bg-emerald-500 px-2.5 py-1.5 text-[11px] text-white">
                ¿Cuánto facturé esta semana?
              </div>
            </div>
            <div className="mt-1.5 flex justify-start">
              <div className="rounded-xl rounded-bl-sm bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-700">
                S/ 4,350 — 12% más que la semana pasada.
              </div>
            </div>
          </div>

          {/* Seguimiento */}
          <div className="hero-float-card hidden lg:block absolute -bottom-10 -left-20 w-64 rounded-2xl border border-slate-200 bg-white shadow-2xl p-3.5 z-20" style={{ "--float-delay": "1s" } as React.CSSProperties}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <Bell className="h-3 w-3" /> Seguimientos de hoy
            </p>
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-slate-800">María Torres</p>
              <p className="text-[10px] text-slate-500">Retoque de toxina · hace 3 meses</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-amber-600">
                  1 día para contactar
                </span>
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Contactar
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">+2 seguimientos más</p>
          </div>

          {/* Analítica por distrito */}
          <div className="hero-float-card hidden lg:block absolute -bottom-6 -right-14 w-56 rounded-2xl border border-slate-200 bg-white shadow-2xl p-3.5 z-10" style={{ "--float-delay": "1.2s" } as React.CSSProperties}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <BarChart3 className="h-3 w-3" /> Pacientes por distrito
            </p>
            <div className="mt-2 space-y-1.5">
              {[
                { d: "Miraflores", v: 42 },
                { d: "San Borja", v: 27 },
                { d: "Surco", v: 18 },
              ].map((r) => (
                <div key={r.d}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-600">{r.d}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{r.v}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${r.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Versión móvil de las flotantes: fila con scroll horizontal */}
          <div className="lg:hidden mt-4 flex gap-3 overflow-x-auto pb-2 -mx-6 px-6">
            {[
              { t: "Asistente IA", d: "\u201c¿Cuánto facturé esta semana?\u201d — S/ 4,350, +12%", Icon: Sparkles },
              { t: "Seguimientos", d: "María Torres · retoque de toxina — 1 día para contactar", Icon: Bell },
              { t: "Por distrito", d: "Miraflores 42% · San Borja 27% · Surco 18%", Icon: BarChart3 },
            ].map(({ t, d, Icon }) => (
              <div key={t} className="min-w-[220px] shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm p-3 text-left">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  <Icon className="h-3 w-3" /> {t}
                </p>
                <p className="mt-1 text-[11px] text-slate-600 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
