"use client";

import Link from "next/link";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { CLOSING, V2_VARIANT } from "./content";
import { Arrow, Container, Eyebrow, btnLight } from "./primitives";

export function ClosingV2() {
  const profile = useLandingProfile();
  const trial = LANDING_CTAS.trial;
  return (
    <section className="bg-white pb-16 pt-4 sm:pb-20">
      <Container>
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-2xl bg-emerald-950 px-7 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <span aria-hidden className="pointer-events-none absolute -top-10 right-[28%] select-none font-display text-[280px] leading-none text-white/[0.035]">
            ✦
          </span>
          <div className="relative max-w-xl">
            <Eyebrow tone="light">{CLOSING.eyebrow}</Eyebrow>
            <h2 className="mt-4 font-display text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em] text-emerald-50 sm:text-[2.6rem]">
              {CLOSING.title}
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-emerald-100/80">{CLOSING.body}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-emerald-100/60">{CLOSING.growth}</p>
          </div>
          <div className="relative flex flex-col items-start gap-3 lg:items-center">
            <Link
              href={trial.href}
              onClick={() =>
                trackLanding(trial.event, { perfil: profile, ubicacion: "final-cta", variante: V2_VARIANT })
              }
              className={btnLight}
            >
              {trial.label} <Arrow />
            </Link>
            <span className="text-[11px] text-emerald-100/70">{CLOSING.microcopy}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
