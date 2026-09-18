"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock, Mail, MessageCircle } from "lucide-react";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { V2_VARIANT, WORKFLOW } from "./content";
import { Arrow, Container, Eyebrow, Initials, StatusDot, Tag, btnLight } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Pieza central de `/2`: el motor de seguimientos como recorrido de tres
 * pasos (detecta, contacta, mide) con una demo que cambia al elegir cada
 * paso. Regla heredada de la home: cada frase describe algo que ya existe;
 * nada de "la contacta automáticamente" (hay una persona apretando el
 * botón) ni de plata recuperada. La demo es ilustrativa y la paciente,
 * ficticia.
 */

function StepDetect() {
  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-5 flex items-center justify-between text-[9px]">
          <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-amber-700">
            <Clock className="h-3.5 w-3.5" /> Seguimiento abierto
          </span>
          <span className="text-slate-500">Sin cita desde hace 4 meses</span>
        </div>
        <div className="flex items-center gap-3">
          <Initials className="h-10 w-10 text-sm">MT</Initials>
          <div>
            <p className="font-display text-base font-semibold text-slate-900">M. Torres</p>
            <p className="mt-1 text-[11px] text-slate-500">Control post-tratamiento · cita completada sin siguiente control</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5 text-[11px] text-slate-500">
          <span>Próximo control</span>
          <strong className="font-medium text-slate-900">Sin cita agendada</strong>
        </div>
      </div>
      <ActionLabel>Yenda abre el seguimiento y lo pone en la bandeja de tu equipo</ActionLabel>
    </>
  );
}

function StepContact() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100/80 p-5">
      <div className="mb-4 flex items-center gap-2.5 text-xs">
        <Initials className="bg-white">MT</Initials>
        <strong className="font-semibold text-slate-900">M. Torres</strong>
        <Tag tone="amber">Intento 2 de 3</Tag>
      </div>
      <div className="ml-5 rounded-[0_12px_12px_12px] bg-white p-4 text-[12.5px] leading-relaxed text-slate-800 shadow-sm">
        Hola, María 👋 Ya pasaron unos meses desde tu último control y nos gustaría verte de nuevo.
        ¿Qué día te acomoda esta semana?
        <span className="mt-2 block text-right text-[9px] text-slate-500">Plantilla editable · borrador listo para revisar</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-wa-700 px-3 py-2 text-[11px] font-semibold text-white">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
          <Mail className="h-3.5 w-3.5" /> Correo
        </span>
        <span className="inline-flex items-center rounded-md px-2 py-2 text-[11px] font-medium text-slate-500">
          Cerrar caso
        </span>
      </div>
      <p className="mt-3.5 flex items-center gap-2 text-[10.5px] text-slate-600">
        <Check className="h-3.5 w-3.5 text-emerald-700" /> Tu equipo decide cuándo enviar: nada sale sin una persona detrás.
      </p>
    </div>
  );
}

function StepMeasure() {
  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-center">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-xl text-emerald-700">
          ✓
        </span>
        <p className="font-display text-xl font-semibold text-slate-900">Cita recuperada</p>
        <p className="mt-1.5 text-xs text-slate-500">M. Torres tiene su control agendado.</p>
        <div className="mt-5 flex items-center gap-3 rounded-md bg-emerald-50/70 p-3 text-left">
          <CalendarDays className="h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-[12px] font-semibold text-slate-900">Sábado 12 de septiembre · 09:30 a. m.</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Control post-tratamiento · nace del seguimiento</p>
          </div>
        </div>
      </div>
      <ActionLabel>Queda marcada como recuperada: solo cuenta la que agendó después del contacto</ActionLabel>
    </>
  );
}

function ActionLabel({ children }: { children: string }) {
  return (
    <p className="mt-3.5 flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-[10.5px] font-medium text-emerald-800">
      <Check className="h-3.5 w-3.5 shrink-0" /> {children}
    </p>
  );
}

const PANELS = [StepDetect, StepContact, StepMeasure];

export function FollowupWorkflowV2() {
  const [step, setStep] = useState(0);
  const profile = useLandingProfile();
  const demo = LANDING_CTAS.demo;
  const Panel = PANELS[step];
  const last = step === WORKFLOW.steps.length - 1;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const n = WORKFLOW.steps.length;
    let target: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = (step + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = (step - 1 + n) % n;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = n - 1;
    if (target === null) return;
    e.preventDefault();
    setStep(target);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[target])?.focus();
  }

  return (
    <section id="seguimiento" className="relative scroll-mt-20 overflow-hidden bg-emerald-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-52 -top-36 h-[400px] w-[400px] rounded-full border border-white/[0.04] shadow-[0_0_0_60px_rgba(255,255,255,0.015),0_0_0_120px_rgba(255,255,255,0.01)]"
      />
      <div aria-hidden className="pointer-events-none absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <Container className="relative py-20 sm:py-24 lg:py-28">
        <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="max-w-2xl">
            <Eyebrow tone="light">{WORKFLOW.eyebrow}</Eyebrow>
            <h2 className="mt-4 font-display text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em] text-emerald-50 sm:text-4xl lg:text-[2.75rem]">
              {WORKFLOW.title}
            </h2>
          </div>
          <p className="max-w-sm text-[15px] leading-[1.8] text-emerald-100/75">{WORKFLOW.intro}</p>
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.12fr] lg:gap-16">
          <div role="tablist" aria-label="Pasos del seguimiento" onKeyDown={onKey} className="flex flex-col gap-1">
            {WORKFLOW.steps.map((s, i) => {
              const active = i === step;
              return (
                <button
                  key={s.title}
                  type="button"
                  role="tab"
                  id={`paso-${i}`}
                  aria-selected={active}
                  aria-controls="paso-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => setStep(i)}
                  className={cn(
                    "flex items-start gap-5 rounded-lg px-4 py-5 text-left transition-colors duration-[var(--dur-base)] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
                    active && "bg-white/[0.06]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-display text-xs",
                      active
                        ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                        : "border-emerald-200/40 text-emerald-200/70"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    <strong
                      className={cn(
                        "block font-display text-lg font-semibold",
                        active ? "text-emerald-300" : "text-emerald-100/90"
                      )}
                    >
                      {s.title}
                    </strong>
                    <span className="mt-2 block max-w-[330px] text-[13.5px] leading-[1.75] text-emerald-100/70">
                      {s.body}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn("ml-auto hidden text-xl text-emerald-300 transition-opacity sm:block", active ? "opacity-100" : "opacity-0")}
                  >
                    →
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-w-0 rounded-xl border border-white/15 bg-slate-50 p-5 text-slate-900 shadow-[0_20px_40px_rgba(6,30,42,0.25)] sm:p-6">
            <div className="flex items-center justify-between gap-3 pb-5 text-[9px] text-slate-500">
              <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.08em] text-emerald-800">
                <StatusDot className="h-[5px] w-[5px]" /> {WORKFLOW.demoLabel}
              </span>
              <span>{WORKFLOW.demoNote}</span>
            </div>
            <div
              key={step}
              id="paso-panel"
              role="tabpanel"
              aria-labelledby={`paso-${step}`}
              className="flex min-h-[265px] flex-col justify-center motion-safe:animate-[fadeUp_0.3s_ease-out]"
            >
              <Panel />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 pt-5 text-[9px] text-slate-500">
              <span>Datos ficticios</span>
              <button
                type="button"
                onClick={() => setStep((step + 1) % WORKFLOW.steps.length)}
                className="inline-flex items-center gap-3 rounded-md bg-emerald-950 px-3 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {last ? WORKFLOW.restart : WORKFLOW.nextStep}
                <span aria-hidden>{last ? "↺" : "→"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-emerald-300">{WORKFLOW.triggersEyebrow}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {WORKFLOW.triggers.map((t) => (
                <li key={t} className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] text-emerald-50/90">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={demo.href}
            onClick={() =>
              trackLanding(demo.event, { perfil: profile, ubicacion: "seguimiento", variante: V2_VARIANT })
            }
            className={cn(btnLight, "self-start lg:self-auto")}
          >
            {WORKFLOW.cta} <Arrow />
          </Link>
        </div>
      </Container>
    </section>
  );
}
