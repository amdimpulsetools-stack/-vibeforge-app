"use client";

import { useState } from "react";
import { CalendarDays, Check, RotateCcw, Sparkles, Users, Wallet } from "lucide-react";
import { HERO } from "./content";
import { Initials, Tag } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Mockup de la app en el hero: ventana con barra lateral de tres vistas
 * (agenda, pacientes, caja) y dos notas flotantes (asistente IA, cita
 * recuperada). Decorativo y con datos ficticios: los mismos nombres y
 * cifras que ya usan los mockups de la home. Sin imágenes: todo es DOM,
 * así que la CSP de la landing no necesita cambios.
 */

type View = "agenda" | "pacientes" | "caja";

const TABS: { id: View; label: string; Icon: typeof CalendarDays }[] = [
  { id: "agenda", label: "Agenda", Icon: CalendarDays },
  { id: "pacientes", label: "Pacientes", Icon: Users },
  { id: "caja", label: "Caja", Icon: Wallet },
];

function Row({
  time,
  initials,
  tone,
  name,
  detail,
  tag,
  tagTone,
}: {
  time?: string;
  initials: string;
  tone?: "green" | "lilac" | "peach" | "sky";
  name: string;
  detail: string;
  tag: string;
  tagTone?: "green" | "amber" | "violet" | "slate";
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-slate-100 py-2.5">
      {time !== undefined && (
        <span className="w-8 shrink-0 text-[10px] text-slate-500">{time}</span>
      )}
      <Initials tone={tone}>{initials}</Initials>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-900">{name}</p>
        <p className="truncate text-[10px] text-slate-500">{detail}</p>
      </div>
      <Tag tone={tagTone}>{tag}</Tag>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex-1 rounded-md border border-slate-100 p-2">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold leading-none text-slate-900">
        {value}
        {note && <span className="ml-1.5 text-[9px] font-medium text-emerald-700">{note}</span>}
      </p>
    </div>
  );
}

const BARS = [42, 67, 51, 77, 94, 64];
const DAYS = ["L", "M", "M", "J", "V", "S"];

function AgendaView() {
  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-slate-900">
            Jueves, 21 de agosto
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Tu agenda de hoy · 2 consultorios</p>
        </div>
        <span className="rounded bg-emerald-600 px-2 py-1.5 text-[9px] font-semibold text-white">
          + Nueva cita
        </span>
      </div>
      <div className="mb-3.5 flex gap-2">
        <Stat label="Citas de hoy" value="9" />
        <Stat label="Pendientes" value="2" />
        <Stat label="Ocupación" value="75%" />
      </div>
      <Row time="09:00" initials="MT" name="María Torres" detail="Limpieza facial · Consultorio 202" tag="Confirmada" />
      <Row time="09:30" initials="AM" tone="lilac" name="Ana Mendoza" detail="Toxina botulínica · Consultorio 203" tag="Programada" tagTone="violet" />
      <Row time="10:00" initials="CR" tone="peach" name="Carlos Ríos" detail="1era consulta · Consultorio 202" tag="Por confirmar" tagTone="amber" />
    </>
  );
}

function PacientesView() {
  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-slate-900">
            La ficha, antes de que se siente.
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Historial, deudas, último servicio y notas</p>
        </div>
        <span className="text-[9px] text-slate-400">Ejemplo</span>
      </div>
      <div className="mb-3.5 flex gap-2">
        <Stat label="Pacientes nuevos" value="45" note="este mes" />
        <Stat label="Sin cita en 60 días" value="12" />
      </div>
      <Row initials="MT" name="María Torres" detail="Retoque de toxina · hace 3 meses" tag="1 día para contactar" tagTone="amber" />
      <Row initials="CL" tone="lilac" name="Carlos López" detail="Ecografía · última visita 16 de agosto" tag="Al día" />
      <Row initials="AR" tone="peach" name="Ana Rodríguez" detail="Control post operatorio · hoy" tag="Nota SOAP pendiente" tagTone="violet" />
    </>
  );
}

function CajaView() {
  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-slate-900">
            Las cuentas, claras.
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Esta semana · datos de ejemplo</p>
        </div>
        <Tag>Actualizado</Tag>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-slate-100 bg-slate-50/70 p-2.5">
          <p className="text-[9px] text-slate-500">Ingresos</p>
          <p className="mt-1 font-display text-xl font-semibold leading-none text-slate-900">S/ 8,450</p>
          <p className="mt-1 text-[9px] text-emerald-700">42 de 48 citas completadas</p>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50/70 p-2.5">
          <p className="text-[9px] text-slate-500">Ocupación</p>
          <p className="mt-1 font-display text-xl font-semibold leading-none text-slate-900">87%</p>
          <p className="mt-1 text-[9px] text-emerald-700">3 cancelaciones (6%)</p>
        </div>
      </div>
      <div
        aria-label="Gráfico ilustrativo de ingresos de lunes a sábado"
        className="mt-4 flex h-16 items-end gap-2 border-b border-slate-200 px-1"
      >
        {BARS.map((h, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-t-[3px]",
              i === 4 ? "bg-emerald-600" : "bg-emerald-200"
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-around text-[9px] text-slate-500">
        {DAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
    </>
  );
}

export function AppWindow() {
  const [view, setView] = useState<View>("agenda");

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[520px] pb-8 pt-10 lg:max-w-none" aria-hidden>
      <div className="pointer-events-none absolute -inset-x-8 -top-6 bottom-4 -z-10 rounded-full bg-[radial-gradient(ellipse_at_70%_55%,rgba(16,185,129,0.16)_0,rgba(16,185,129,0.06)_40%,transparent_72%)]" />

      {/* Nota flotante: asistente IA (violeta = IA/automatización) */}
      <div className="absolute right-0 top-0 z-20 flex w-[248px] items-center gap-2.5 rounded-xl border border-violet-100 bg-white p-3 shadow-[0_10px_30px_rgba(38,75,36,0.08)] motion-safe:rotate-[3deg] sm:right-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-900">Asistente IA</p>
          <p className="text-[10px] leading-snug text-slate-500">
            «¿Cuánto facturé esta semana?» S/ 4,350, +12%
          </p>
        </div>
      </div>

      {/* Ventana de la app */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_25px_55px_rgba(35,60,36,0.10),0_2px_5px_rgba(36,63,41,0.06)] transition-transform duration-[var(--dur-slower)] motion-safe:rotate-[-1.5deg] motion-safe:hover:rotate-0">
        <div className="flex h-8 items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 text-[9px] text-slate-500">
          <span className="flex gap-1">
            <i className="h-[5px] w-[5px] rounded-full bg-emerald-300" />
            <i className="h-[5px] w-[5px] rounded-full bg-slate-300" />
            <i className="h-[5px] w-[5px] rounded-full bg-slate-300" />
          </span>
          <span>yenda.app</span>
          <span className="text-[7px] tracking-[1px]">DEMO</span>
        </div>
        <div className="flex min-h-[318px]">
          <aside className="flex w-[52px] shrink-0 flex-col items-center gap-3 border-r border-slate-100 bg-slate-50/60 py-3.5">
            <span className="mb-1.5 font-display text-2xl font-extrabold leading-none tracking-tighter text-emerald-600">
              y<span className="align-super text-[10px] text-violet-500">✦</span>
            </span>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                tabIndex={-1}
                aria-pressed={view === id}
                aria-label={label}
                onClick={() => setView(id)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md transition-colors",
                  view === id
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.7} />
              </button>
            ))}
            <span className="mt-auto rounded-full bg-slate-200 px-1.5 py-1 text-[8px] font-semibold text-slate-600">
              DR
            </span>
          </aside>
          <div className="min-w-0 flex-1 p-4 pt-[18px]">
            {view === "agenda" && <AgendaView />}
            {view === "pacientes" && <PacientesView />}
            {view === "caja" && <CajaView />}
          </div>
        </div>
      </div>

      {/* Nota flotante: cita recuperada */}
      <div className="relative z-20 -mt-4 ml-1 flex w-[92%] items-center gap-2.5 rounded-lg border border-emerald-100 bg-white px-3.5 py-3 shadow-[0_12px_30px_rgba(33,61,36,0.08)] motion-safe:rotate-[1.2deg] sm:-ml-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <RotateCcw className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-900">Cita recuperada · 12 sep</p>
          <p className="truncate text-[10px] text-slate-500">
            M. Torres agendó su control después del seguimiento
          </p>
        </div>
        <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
      </div>

      <p className="mt-6 flex items-center justify-center gap-2.5 text-[10px] tracking-wide text-slate-500">
        <span className="h-px w-7 bg-slate-300" />
        {HERO.caption}
        <span className="h-px w-7 bg-slate-300" />
      </p>
    </div>
  );
}
