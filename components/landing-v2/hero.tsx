"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { trackLanding } from "@/lib/landing-analytics";
import {
  HERO_HEADLINE,
  LANDING_CTAS,
  LANDING_PROFILES,
  LANDING_PROFILE_CONTENT,
} from "@/components/landing/landing-copy";
import {
  selectLandingProfile,
  useLandingProfileContent,
} from "@/components/landing/use-landing-profile";
import { HERO, V2_VARIANT } from "./content";
import { AppWindow } from "./app-window";
import { Arrow, Container, Eyebrow, Underlined, btnPrimary, textLink } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Hero de `/2`: texto a la izquierda, mockup de la app a la derecha. El H1 es
 * el mismo de la home (fijo, no rota) y el segmentador de perfil solo cambia
 * el subtítulo, como en `/`. Sin botón de demo en el hero (decisión del
 * 15-sep-2026); el enlace secundario baja al motor de seguimientos.
 */
export function HeroV2() {
  const { profile, content } = useLandingProfileContent();
  const trial = LANDING_CTAS[content.primary];

  // Subrayado a mano bajo la frase clave del titular, sin tocar la constante.
  const [before, after] = HERO_HEADLINE.highlight.includes(HERO.underlined)
    ? HERO_HEADLINE.highlight.split(HERO.underlined)
    : [HERO_HEADLINE.highlight, null];

  return (
    <section className="relative overflow-hidden">
      <Container className="grid items-center gap-12 pb-14 pt-12 lg:grid-cols-2 lg:gap-14 lg:pb-20 lg:pt-16">
        <div className="min-w-0 max-w-2xl">
          <Eyebrow dot>{HERO.eyebrow}</Eyebrow>

          <h1 className="mt-6 font-display text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.035em] text-slate-900 sm:text-[3.25rem] lg:text-[3.25rem] xl:text-[3.5rem]">
            {HERO_HEADLINE.lead}{" "}
            <span className="text-emerald-700">
              {after === null ? (
                before
              ) : (
                <>
                  {before}
                  <Underlined>{HERO.underlined}</Underlined>
                  {after}
                </>
              )}
            </span>
          </h1>

          <div
            role="radiogroup"
            aria-label="¿Qué describe mejor tu práctica?"
            className="mt-6 flex flex-wrap gap-2"
          >
            {LANDING_PROFILES.map((p) => {
              const selected = p === profile;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectLandingProfile(p)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-[var(--dur-fast)]",
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                  )}
                >
                  {LANDING_PROFILE_CONTENT[p].label}
                </button>
              );
            })}
          </div>

          <p className="mt-5 max-w-md text-[15px] leading-[1.8] text-slate-600 sm:text-base">
            {content.subtitle}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href={trial.href}
              onClick={() =>
                trackLanding(trial.event, {
                  perfil: profile,
                  ubicacion: "hero",
                  variante: V2_VARIANT,
                })
              }
              className={btnPrimary}
            >
              {trial.label} <Arrow />
            </Link>
            <a href={HERO.secondary.href} className={textLink}>
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-full border border-slate-300 pl-px text-[8px]"
              >
                ▶
              </span>
              {HERO.secondary.label} <Arrow />
            </a>
          </div>

          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <Check aria-hidden className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
            {HERO.microcopy.map((m, i) => (
              <span key={m} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-slate-300">·</span>}
                {m}
              </span>
            ))}
          </p>
          <p className="mt-2 text-xs text-slate-500">{HERO.confidence}</p>
        </div>

        <AppWindow />
      </Container>
    </section>
  );
}
