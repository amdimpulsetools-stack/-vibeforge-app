"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Sparkles } from "lucide-react";
import { exceedsMpPreapprovalCap } from "@/lib/billing/constants";
import {
  PRICING_PLANS,
  anchorFor,
  periodTotal,
  priceFor,
  type Cadence,
} from "@/components/landing/pricing-plans";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { PRICING, V2_VARIANT } from "./content";
import { Arrow, Container, Eyebrow, SectionTitle, btnOutline, btnPrimary } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Precios de `/2`: los mismos tres planes, cadencias y avisos de Mercado
 * Pago que la home (todo importado de `pricing-plans.ts`), presentados con
 * la banda "Recomendado" sobre la tarjeta destacada y el precio como cifra
 * grande. Esta sección conserva el monopolio del ancla de precio.
 */
export function PricingV2() {
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const profile = useLandingProfile();
  const trial = LANDING_CTAS.trial;

  return (
    <section id="precios" className="scroll-mt-20 bg-slate-50">
      <Container className="py-20 sm:py-24 lg:py-28">
        <div className="mb-14 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl lg:min-w-0 lg:flex-1">
            <Eyebrow>{PRICING.eyebrow}</Eyebrow>
            <SectionTitle className="mt-4">{PRICING.title}</SectionTitle>
            <p className="mt-4 text-[15px] text-slate-600">{PRICING.intro}</p>
          </div>
          <div role="group" aria-label="Frecuencia de pago" className="flex w-full flex-wrap items-center rounded-lg bg-slate-200/70 p-1 sm:w-max sm:flex-nowrap lg:shrink-0">
            {PRICING.cadences.map((c) => {
              const selected = cadence === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCadence(c.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12.5px] font-medium transition-colors sm:flex-none sm:px-3.5",
                    selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {c.label}
                  {c.badge && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                      {c.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-12 lg:grid-cols-3 lg:gap-5">
          {PRICING_PLANS.map((plan) => {
            const total = periodTotal(plan, cadence);
            const capped = cadence !== "monthly" && exceedsMpPreapprovalCap(total);
            return (
              <article
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-white p-7 pt-8",
                  plan.highlight ? "rounded-t-none border-emerald-600 bg-emerald-50/40 lg:-mt-2" : "border-slate-200"
                )}
              >
                {plan.highlight && (
                  <div className="absolute inset-x-[-1px] bottom-full flex items-center justify-between rounded-t-xl bg-emerald-950 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
                    {PRICING.recommended}
                    <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                  </div>
                )}
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{PRICING.kicker[plan.name]}</p>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{plan.name}</h3>
                <p className="mt-2 min-h-[2.5rem] text-[12.5px] leading-relaxed text-slate-500">{plan.anchor}</p>

                <div key={cadence} className="mt-5 flex items-baseline gap-1.5 motion-safe:animate-[fadeUp_0.25s_ease-out]">
                  <span className="text-xl font-medium text-slate-900">S/</span>
                  <strong className="font-display text-[2.9rem] font-semibold leading-none tracking-[-0.03em] text-slate-900">
                    {priceFor(plan, cadence)}
                  </strong>
                  <span className="text-[12px] text-slate-500">{PRICING.perMonth}</span>
                  {cadence !== "monthly" && (
                    <span className="ml-1 text-[12px] text-slate-400 line-through">S/{plan.priceMonthly}</span>
                  )}
                </div>
                <p className="mt-2 min-h-[1.1rem] text-[11px] text-emerald-700">
                  {cadence === "monthly" ? PRICING.monthlyNote : anchorFor(plan, cadence)}
                </p>
                {capped && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                    {cadence === "annual" ? PRICING.mpCap.annual : PRICING.mpCap.semiannual}
                  </p>
                )}

                <Link
                  href={trial.href}
                  onClick={() =>
                    trackLanding(trial.event, {
                      perfil: profile,
                      ubicacion: `precios-${plan.name.toLowerCase().replace(/\s+/g, "-")}`,
                      variante: V2_VARIANT,
                    })
                  }
                  className={cn(plan.highlight ? btnPrimary : btnOutline, "mt-5 w-full justify-between text-[13px]")}
                >
                  {trial.label} <Arrow />
                </Link>
                <p className="mt-2 text-center text-[11px] text-slate-500">{PRICING.noCard}</p>

                <ul className="mb-5 mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[12.5px] leading-relaxed text-slate-700">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} /> {f}
                    </li>
                  ))}
                </ul>
                <p className="flex items-center gap-2 border-t border-slate-100 pt-4 text-[11px] font-medium text-violet-700">
                  <Sparkles className="h-3.5 w-3.5" /> {PRICING.aiIncluded}
                </p>
              </article>
            );
          })}
        </div>

        <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12.5px] text-slate-600">
          {PRICING.riskFree.map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} /> {r}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center text-[13px] text-slate-600">
          {PRICING.addons.lead}
          <strong className="font-semibold text-slate-900">{PRICING.addons.strong}</strong>
          {PRICING.addons.tail}
        </p>

        <div className="mt-10 flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <Building2 className="h-5 w-5 text-emerald-700" /> {PRICING.enterprise.title}
              <span className="text-sm font-normal text-slate-500">· {PRICING.enterprise.subtitle}</span>
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">{PRICING.enterprise.body}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Link href={PRICING.enterprise.href} className={btnOutline}>
              {PRICING.enterprise.cta} <Arrow />
            </Link>
            <span className="text-[11px] text-slate-500">{PRICING.enterprise.price}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
