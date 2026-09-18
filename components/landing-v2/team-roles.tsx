"use client";

import { useState, type KeyboardEvent } from "react";
import { Headset, ShieldCheck, Sparkles, Stethoscope, TrendingUp } from "lucide-react";
import { AI, TEAM } from "./content";
import { Container, Eyebrow, SectionTitle, textLink } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Roles del equipo como pestañas (recepcionista, administrador, doctor,
 * ventas & marketing) con un panel copy | mockup, y debajo la franja del
 * asistente IA (violeta = IA) con la demo desplegable: se elige una
 * pregunta real y se muestra la respuesta, como en la home.
 */
const ICONS = {
  recepcion: Headset,
  admin: ShieldCheck,
  doctor: Stethoscope,
  marketing: TrendingUp,
} as const;

export function TeamRolesV2() {
  const [active, setActive] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [question, setQuestion] = useState(0);
  const role = TEAM.roles[active];
  const Icon = ICONS[role.id];

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const n = TEAM.roles.length;
    let target: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = (active + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = (active - 1 + n) % n;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = n - 1;
    if (target === null) return;
    e.preventDefault();
    setActive(target);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[target])?.focus();
  }

  return (
    <section id="equipo" className="scroll-mt-20 bg-white">
      <Container className="py-20 sm:py-24 lg:py-28">
        <div className="text-left sm:text-center">
          <Eyebrow className="sm:justify-center">{TEAM.eyebrow}</Eyebrow>
          <SectionTitle className="mt-4">
            {TEAM.titleLead} <span className="text-slate-400">{TEAM.titleMuted}</span>
          </SectionTitle>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-[1.8] text-slate-600">{TEAM.intro}</p>
        </div>

        <div
          role="tablist"
          aria-label="Roles del equipo"
          onKeyDown={onKey}
          className="mt-9 flex gap-1.5 overflow-x-auto pb-1 sm:justify-center sm:overflow-visible"
        >
          {TEAM.roles.map((r, i) => {
            const RIcon = ICONS[r.id];
            const selected = i === active;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                id={`rol-${r.id}`}
                aria-selected={selected}
                aria-controls="rol-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg border px-4 py-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  selected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                <RIcon className="h-4 w-4" strokeWidth={1.8} />
                {r.tab}
              </button>
            );
          })}
        </div>

        <div
          key={role.id}
          id="rol-panel"
          role="tabpanel"
          aria-labelledby={`rol-${role.id}`}
          className="mt-6 grid items-center gap-8 rounded-xl border border-slate-200 bg-slate-50/70 p-6 sm:p-9 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-12 motion-safe:animate-[fadeUp_0.3s_ease-out]"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-600">{role.painKiller}</p>
            <h3 className="mt-3.5 font-display text-[1.65rem] font-semibold leading-[1.25] tracking-[-0.02em] text-slate-900">
              {role.headline}
            </h3>
            <p className="mt-3.5 text-[14.5px] leading-[1.8] text-slate-600">{role.subline}</p>
            <ul className="mt-5 space-y-3">
              {role.features.map((f) => (
                <li key={f.title} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-700">
                  <span aria-hidden className="mt-px shrink-0 text-emerald-600">✓</span>
                  <span>
                    <strong className="font-semibold text-slate-900">{f.title}.</strong> {f.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_22px_rgba(55,81,41,0.06)] motion-safe:rotate-[1deg]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 text-xs">
              <strong className="flex items-center gap-2 font-semibold text-slate-900">
                <Icon className="h-4 w-4 text-emerald-700" strokeWidth={1.8} /> {role.mockup.title}
              </strong>
              <span className="text-[10px] text-slate-500">Vista de ejemplo</span>
            </div>
            {role.mockup.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0 last:pb-0">
                <span className="text-[12px] text-slate-700">{row.label}</span>
                <span className={cn("text-[12px] font-medium", row.accent ? "text-emerald-700" : "text-slate-500")}>
                  {row.value}
                </span>
              </div>
            ))}
            <p className="mt-4 text-[10px] text-slate-400">{TEAM.mockupFoot(role.tab)}</p>
          </div>
        </div>

        {/* Franja del asistente IA */}
        <div className="mt-6 grid grid-cols-[28px_1fr] items-center gap-x-4 gap-y-3 rounded-lg border border-violet-100 bg-violet-50/70 px-6 py-5 sm:flex sm:gap-5">
          <Sparkles className="h-7 w-7 text-violet-500" strokeWidth={1.6} />
          <div className="min-w-0 sm:flex-1">
            <p className="text-[14px] font-semibold text-slate-900">
              {AI.titleLead} <span className="text-violet-700">{AI.titleAccent}</span>
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{AI.intro}</p>
          </div>
          <button
            type="button"
            aria-expanded={aiOpen}
            aria-controls="ai-ejemplo"
            onClick={() => setAiOpen((v) => !v)}
            className={cn(textLink, "col-start-2 whitespace-nowrap text-violet-700 hover:text-violet-900")}
          >
            {aiOpen ? AI.toggleClose : AI.toggleOpen} <span aria-hidden>{aiOpen ? "×" : "↗"}</span>
          </button>
        </div>

        <div
          id="ai-ejemplo"
          hidden={!aiOpen}
          className="ml-auto mt-3 max-w-3xl rounded-lg border border-violet-100 bg-white p-6 motion-safe:animate-[fadeUp_0.3s_ease-out]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">{AI.prompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AI.questions.map((q, i) => (
              <button
                key={q.question}
                type="button"
                aria-pressed={i === question}
                onClick={() => setQuestion(i)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-left text-[12px] transition-colors",
                  i === question
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"
                )}
              >
                {q.question}
              </button>
            ))}
          </div>
          <div key={question} aria-live="polite" className="mt-4 rounded-[0_12px_12px_12px] bg-slate-50 p-4 text-[14px] leading-[1.8] text-slate-800 motion-safe:animate-[fadeUp_0.25s_ease-out]">
            {AI.questions[question].answer}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {AI.tiers.map((t) => (
              <span key={t.plan} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                <strong className="font-semibold text-slate-800">{t.level}</strong> · {t.plan}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{AI.disclaimer}</p>
        </div>
      </Container>
    </section>
  );
}
