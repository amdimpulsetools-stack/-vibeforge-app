"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { computeRecovery, formatSoles, planForDoctors } from "@/components/landing/roi-model";
import { IMPACT, V2_VARIANT } from "./content";
import { Arrow, Container, Eyebrow, SectionTitle, btnPrimary } from "./primitives";

/**
 * Impacto en ingresos: las cuatro fugas y la calculadora. La fórmula es la
 * misma de la home (`roi-model.ts`, auditoría 2026-08-21: un solo claim de
 * no-shows 20%→12% y captación +4%); aquí solo cambia la presentación. El
 * plan y su precio se evalúan en el mismo campo visual que el resultado.
 */

const { sliders } = IMPACT.calculator;

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  valueText,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  valueText: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-6">
      <label htmlFor={id} className="mb-3 flex items-center justify-between text-[13px] text-slate-700">
        {label}
        <output htmlFor={id} className="rounded bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800">
          {display}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-emerald-600) ${pct}%, var(--color-slate-200) ${pct}%)`,
        }}
        className="block h-1.5 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-emerald-600 [&::-moz-range-thumb]:shadow-[0_0_0_1px_var(--color-emerald-600)] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-emerald-600 [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_var(--color-emerald-600)]"
      />
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function ImpactV2() {
  const [doctors, setDoctors] = useState<number>(sliders.doctors.initial);
  const [appts, setAppts] = useState<number>(sliders.appts.initial);
  const [fee, setFee] = useState<number>(sliders.fee.initial);
  const profile = useLandingProfile();
  const trial = LANDING_CTAS.trial;
  const calc = IMPACT.calculator;

  const monthly = computeRecovery(doctors, appts, fee);
  const yearly = monthly * 12;
  const plan = planForDoctors(doctors);
  const multiple = Math.max(1, Math.round(monthly / plan.price));

  return (
    <section id="impacto" className="scroll-mt-20 border-y border-emerald-100 bg-emerald-50/60">
      <Container className="grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-[1fr_0.92fr] lg:gap-24 lg:py-28">
        <div>
          <Eyebrow>{IMPACT.eyebrow}</Eyebrow>
          <SectionTitle className="mt-5">
            {IMPACT.titleLead} <span className="text-emerald-700">{IMPACT.titleAccent}</span>
          </SectionTitle>
          <p className="mt-5 max-w-md text-[15px] leading-[1.85] text-slate-600">{IMPACT.intro}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {IMPACT.leaks.map((l) => (
              <li key={l.title} className="rounded-lg border border-emerald-100 bg-white/80 p-4">
                <p className="text-[13px] font-semibold text-slate-900">{l.title}</p>
                <p className="mt-1.5 text-[12px]">
                  <span className="text-slate-400 line-through decoration-slate-400/70">{l.loss}</span>
                  <span aria-hidden className="mx-2 text-slate-300">→</span>
                  <span className="font-semibold text-emerald-700">{l.recovered}</span>
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-8 hidden max-w-sm gap-3 text-[14px] italic leading-relaxed text-emerald-800/80 motion-safe:-rotate-2 sm:flex">
            <span aria-hidden className="font-display text-3xl leading-none">↝</span>
            {IMPACT.annotation}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-white p-6 shadow-[0_12px_35px_rgba(42,78,30,0.06)] sm:p-8">
          <div className="mb-7 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold tracking-tight text-slate-900">{calc.title}</h3>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-slate-600">
              {calc.pill}
            </span>
          </div>
          <p className="-mt-4 mb-6 text-[12px] text-slate-500">{calc.hint}</p>

          <Slider
            label={sliders.doctors.label}
            value={doctors}
            min={sliders.doctors.min}
            max={sliders.doctors.max}
            step={sliders.doctors.step}
            display={`${doctors}`}
            valueText={`${doctors} ${doctors === 1 ? "doctor" : "doctores"}`}
            onChange={setDoctors}
          />
          <Slider
            label={sliders.appts.label}
            value={appts}
            min={sliders.appts.min}
            max={sliders.appts.max}
            step={sliders.appts.step}
            display={`${appts}`}
            valueText={`${appts} citas por doctor al mes`}
            onChange={setAppts}
          />
          <Slider
            label={sliders.fee.label}
            value={fee}
            min={sliders.fee.min}
            max={sliders.fee.max}
            step={sliders.fee.step}
            display={formatSoles(fee)}
            valueText={`${fee} soles por cita`}
            onChange={setFee}
          />

          <div className="rounded-lg bg-emerald-950 px-6 py-5 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/90">{calc.resultEyebrow}</p>
            <p className="mt-2 flex items-baseline gap-2">
              <strong aria-live="polite" className="font-display text-[2.6rem] font-semibold leading-none tracking-[-0.03em] text-emerald-300">
                {formatSoles(monthly)}
              </strong>
              <span className="text-[13px] text-emerald-100/80">{calc.perMonth}</span>
            </p>
            <p className="mt-2 text-[12px] text-emerald-100/70">{calc.yearly(formatSoles(yearly))}</p>
            <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-emerald-50/90">
              {calc.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span aria-hidden className="text-emerald-300">✓</span> {b}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-md bg-white/[0.06] px-3 py-2.5 text-[12px] text-emerald-50">
              {calc.planLine(plan.price, plan.name)}{" "}
              <strong className="font-semibold text-emerald-300">{calc.multiple(multiple)}</strong>
            </p>
          </div>

          <Link
            href={trial.href}
            onClick={() =>
              trackLanding(trial.event, { perfil: profile, ubicacion: "calculadora", variante: V2_VARIANT })
            }
            className={`${btnPrimary} mt-5 w-full`}
          >
            {trial.label} <Arrow />
          </Link>
          <p className="mt-2 text-center text-[11px] text-slate-500">{calc.noCard}</p>

          <p className="mt-5 flex gap-2 text-[11px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {calc.disclaimer}
          </p>
        </div>
      </Container>
    </section>
  );
}
