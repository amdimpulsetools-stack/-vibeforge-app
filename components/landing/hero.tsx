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
    <section className="relative z-10 pt-32 pb-0 sm:pt-40">
      {/* Background effects - light mode */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
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

        {/* ── Mockup: réplica fiel del scheduler real al ~80% ──
            Copiado de una captura del producto (founder, 21-ago): cabecera
            con fecha y controles, chips de stats, grilla 202/203 al 75% de
            ocupación y el panel "Detalles de la cita" con sus acciones de
            colores semánticos. El wrapper tiene margen inferior NEGATIVO:
            el mockup se monta sobre la sección oscura siguiente
            (PainPoints compensa con pt extra). aria-hidden: es decorativo. */}
        <div
          ref={dashboardRef}
          aria-hidden
          className="relative z-10 mt-16 -mb-24 sm:-mb-36 mx-auto max-w-5xl opacity-0 translate-y-8 transition-all duration-700 ease-out [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
        >
          <div className="rounded-2xl border border-slate-200/60 bg-white/50 backdrop-blur-sm p-1.5 shadow-2xl shadow-slate-300/60">
            <div className="rounded-xl border border-slate-200/50 bg-white overflow-hidden">

              {/* Cabecera del scheduler */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-300 text-sm">‹</span>
                  <span className="text-[13px] font-bold text-slate-800">Jueves, 21 Agosto</span>
                  <span className="text-slate-300 text-sm">›</span>
                  <span className="ml-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">Hoy</span>
                </div>
                <div className="hidden md:flex items-center gap-1.5">
                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-[10px] font-semibold">
                    <span className="rounded-md bg-white px-2 py-0.5 shadow-sm text-slate-800">Día</span>
                    <span className="px-2 py-0.5 text-slate-400">Semana</span>
                  </div>
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">2 consultorios</span>
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Bloquear</span>
                  <span className="rounded-lg gradient-primary px-2.5 py-1 text-[10px] font-semibold text-white">+ Nueva Cita</span>
                </div>
              </div>

              {/* Chips de stats */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 overflow-x-auto">
                {[
                  ["Total citas:", "9"],
                  ["Pendientes:", "2"],
                  ["Ocupación:", "75%"],
                ].map(([k, v]) => (
                  <span key={k} className="shrink-0 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[10px] text-slate-500">
                    {k} <span className="font-bold text-slate-800">{v}</span>
                  </span>
                ))}
              </div>

              <div className="flex">
                {/* Grilla del día — 75% de ocupación */}
                <div className="flex-1 min-w-0 p-2.5">
                  <div className="grid grid-cols-[38px_1fr_1fr] gap-1 mb-1">
                    <div />
                    {["202", "203"].map((c) => (
                      <div key={c} className="rounded-md bg-slate-50 border border-slate-100 py-0.5 text-[10px] font-bold text-slate-600 text-center">
                        {c}
                      </div>
                    ))}
                  </div>
                  {[
                    { t: "09:00", a: { p: "María Torres", s: "Limpieza facial", st: "ok" }, b: { p: "Jorge Salas", s: "Control", st: "live" } },
                    { t: "09:30", a: { p: "Lucía Paredes", s: "Peeling", st: "ok" }, b: { p: "Ana Mendoza", s: "Toxina botulínica", st: "sel" } },
                    { t: "10:00", a: { p: "Carlos Ríos", s: "1era consulta", st: "pend" }, b: null },
                    { t: "10:30", a: { p: "Renzo Díaz", s: "Retiro de puntos", st: "ok" }, b: { p: "Elsa Quispe", s: "Dermapen", st: "ok" } },
                    { t: "11:00", a: null, b: { p: "Ganicus Torrencio", s: "2da consulta", st: "pend" } },
                    { t: "11:30", a: { p: "Sofía Lau", s: "Ácido hialurónico", st: "ok" }, b: { p: "Pedro Chang", s: "Control", st: "ok" } },
                  ].map((row) => (
                    <div key={row.t} className="grid grid-cols-[38px_1fr_1fr] gap-1 mb-1">
                      <div className="flex items-start justify-end pr-1 pt-0.5 text-[9px] tabular-nums text-slate-400">{row.t}</div>
                      {[row.a, row.b].map((cell, i) =>
                        cell ? (
                          <div
                            key={i}
                            className={`rounded-md border-l-[3px] px-1.5 py-1 ${
                              cell.st === "ok"
                                ? "bg-emerald-50/80 border-emerald-500"
                                : cell.st === "live"
                                  ? "bg-sky-50/80 border-sky-500"
                                  : cell.st === "sel"
                                    ? "bg-emerald-100 border-emerald-600 ring-1 ring-emerald-300"
                                    : "bg-amber-50/80 border-amber-400"
                            }`}
                          >
                            <p className="text-[10px] font-semibold text-slate-800 truncate leading-tight">{cell.p}</p>
                            <p className="text-[9px] text-slate-500 truncate leading-tight">{cell.s}</p>
                          </div>
                        ) : (
                          <div key={i} className="rounded-md border border-dashed border-slate-200 flex items-center justify-center">
                            <Plus className="h-2.5 w-2.5 text-slate-300" />
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>

                {/* Panel "Detalles de la cita" — como en el producto */}
                <div className="hidden sm:flex w-56 shrink-0 flex-col border-l border-slate-100 bg-white p-2.5 gap-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-800">Detalles de la cita</p>
                    <span className="text-slate-300 text-[11px]">✕</span>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">Programada</span>
                  <div className="flex items-center justify-between gap-1">
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 leading-tight">Ana Mendoza</p>
                      <p className="text-[9px] text-slate-500">956 898 587</p>
                    </div>
                    <span className="rounded-md bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 tabular-nums">S/ 200.00</span>
                  </div>
                  <div className="space-y-0.5 text-[10px] text-slate-600">
                    <p>21/08/2026 · 09:30 a 10:00</p>
                    <p className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 inline-block" />
                      Lic. Jorge Espinoza
                    </p>
                    <p>Toxina botulínica</p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[9px] text-slate-500 leading-relaxed">
                    Origen: <span className="text-slate-700 font-medium">Instagram</span><br />
                    Método de pago: <span className="text-slate-700 font-medium">Yape</span>
                  </div>
                  <div className="mt-0.5 space-y-1">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 py-1 text-center text-[10px] font-semibold text-amber-700">Reprogramar</div>
                    <div className="rounded-lg bg-blue-500 py-1 text-center text-[10px] font-semibold text-white">Confirmar</div>
                    <div className="rounded-lg bg-emerald-600 py-1 text-center text-[10px] font-semibold text-white">Completar</div>
                    <div className="flex gap-1">
                      <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 py-1 text-center text-[9px] font-semibold text-amber-700">No asistió</div>
                      <div className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1 text-center text-[9px] font-semibold text-red-600">Cancelar</div>
                    </div>
                  </div>
                  <div className="mt-auto rounded-md border border-slate-100 px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Cobros</p>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] tabular-nums">
                      <span className="text-slate-500">Total S/ 850</span>
                      <span className="font-semibold text-emerald-600">Pagado S/ 650</span>
                    </div>
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
                S/ 4,350, un 12% más que la semana pasada.
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
              { t: "Asistente IA", d: "\u201c¿Cuánto facturé esta semana?\u201d: S/ 4,350, +12%", Icon: Sparkles },
              { t: "Seguimientos", d: "María Torres · retoque de toxina · 1 día para contactar", Icon: Bell },
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
