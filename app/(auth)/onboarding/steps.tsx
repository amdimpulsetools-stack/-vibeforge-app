"use client";

import { ArrowRight, Clock, ClipboardList, Building2, User, Calendar } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { CountryPicker, SpecialtyPicker } from "./pickers";
import { INTERVAL_OPTIONS, WEEKDAYS, type Specialty, type WizardState } from "./types";

// ── Step 0 — Welcome ───────────────────────────────────────────────
interface StepWelcomeProps {
  onStart: () => void;
}
export function StepWelcome({ onStart }: StepWelcomeProps) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Asistente de configuración</h1>
      <p className="text-sm text-muted-foreground">
        Te damos la bienvenida a {APP_NAME}. Te guiaremos por un proceso rápido para
        dejar tu agenda lista antes de entrar al panel.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        Comenzar
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Step 1 — Personal ──────────────────────────────────────────────
interface StepPersonalProps {
  state: WizardState;
  specialties: Specialty[];
  setState: (patch: Partial<WizardState>) => void;
}
export function StepPersonal({ state, specialties, setState }: StepPersonalProps) {
  return (
    <div className="space-y-5">
      <StepHeader n={1} icon={User} title="Tus datos" subtitle="Datos personales básicos del profesional o titular de la cuenta." />
      <div className="space-y-4">
        <Field label="Nombre completo">
          <input
            type="text"
            placeholder="Juan Pérez"
            value={state.fullName}
            onChange={(e) => setState({ fullName: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Especialidad principal">
          <SpecialtyPicker
            specialties={specialties}
            value={state.selectedSpecialty}
            onChange={(s) => setState({ selectedSpecialty: s })}
          />
        </Field>
        <Field label="WhatsApp personal">
          <div className="flex gap-2">
            <CountryPicker value={state.country} onChange={(c) => setState({ country: c })} />
            <input
              type="tel"
              placeholder="987 654 321"
              value={state.phone}
              onChange={(e) => setState({ phone: e.target.value.replace(/[^\d\s-]/g, "") })}
              className={`${inputCls} flex-1`}
            />
          </div>
        </Field>
      </div>
    </div>
  );
}

// ── Step 2 — Clinic ────────────────────────────────────────────────
interface StepClinicProps {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
}
export function StepClinic({ state, setState }: StepClinicProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={2}
        icon={Building2}
        title="Datos de tu clínica"
        subtitle="Información de contacto que aparecerá en correos y recordatorios a tus pacientes."
      />
      <div className="space-y-4">
        <Field label="Nombre de la clínica">
          <input
            type="text"
            placeholder="Clínica Dental Sonrisas"
            value={state.clinicName}
            onChange={(e) => setState({ clinicName: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Teléfono de contacto (WhatsApp de la clínica)">
          <input
            type="tel"
            placeholder="+51 999 000 000"
            value={state.clinicPhone}
            onChange={(e) => setState({ clinicPhone: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Email de contacto">
          <input
            type="email"
            placeholder="info@tuclinica.com"
            value={state.clinicEmail}
            onChange={(e) => setState({ clinicEmail: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Step 3 — Hours & intervals ─────────────────────────────────────
interface StepHoursProps {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
}
export function StepHours({ state, setState }: StepHoursProps) {
  const toggleDay = (idx: number) => {
    const exists = state.activeDays.includes(idx);
    const next = exists ? state.activeDays.filter((d) => d !== idx) : [...state.activeDays, idx];
    setState({ activeDays: next });
  };

  return (
    <div className="space-y-5">
      <StepHeader
        n={3}
        icon={Calendar}
        title="Horario de atención"
        subtitle="Configura los días de trabajo y la duración de los bloques en la agenda."
      />

      {/* Weekdays */}
      <Field label="Días laborales">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const active = state.activeDays.includes(d.idx);
            return (
              <button
                key={d.idx}
                type="button"
                onClick={() => toggleDay(d.idx)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-input bg-background/50 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {d.labelEs}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Hours */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hora de inicio">
          <select
            value={state.startHour}
            onChange={(e) => setState({ startHour: Number(e.target.value) })}
            className={inputCls}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hora de cierre">
          <select
            value={state.endHour}
            onChange={(e) => setState({ endHour: Number(e.target.value) })}
            className={inputCls}
          >
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Interval */}
      <Field label="Duración de los bloques de la agenda">
        <div className="flex flex-wrap gap-1.5">
          {INTERVAL_OPTIONS.map((n) => {
            const active = state.interval === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setState({ interval: n })}
                className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-input bg-background/50 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <Clock className="h-3 w-3" />
                {n} min
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

// ── Step 4 — First service (optional) ──────────────────────────────
interface StepServiceProps {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
}
export function StepService({ state, setState }: StepServiceProps) {
  return (
    <div className="space-y-5">
      <StepHeader
        n={4}
        icon={ClipboardList}
        title="Primer servicio"
        subtitle="Agrega un servicio inicial. Podrás crear más (y categorías) después desde Admin → Servicios. Si lo dejas en blanco, lo omitimos."
      />
      <div className="space-y-4">
        <Field label="Nombre del servicio (opcional)">
          <input
            type="text"
            placeholder="Consulta general"
            value={state.serviceName}
            onChange={(e) => setState({ serviceName: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duración (min)">
            <select
              value={state.serviceDuration}
              onChange={(e) => setState({ serviceDuration: Number(e.target.value) })}
              className={inputCls}
            >
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio base (opcional)">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={state.servicePrice}
              onChange={(e) => setState({ servicePrice: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────
const inputCls =
  "flex h-11 w-full rounded-xl border border-input bg-card px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold">{label}</label>
      {children}
    </div>
  );
}

type IconType = typeof User;
function StepHeader({ n, icon: Icon, title, subtitle }: { n: number; icon: IconType; title: string; subtitle: string }) {
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Paso {n} de 4
      </span>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
