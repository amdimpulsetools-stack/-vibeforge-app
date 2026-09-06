"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { trackLanding } from "@/lib/landing-analytics";
import { useLandingProfile } from "@/components/landing/use-landing-profile";

export function FinalCTA() {
  const profile = useLandingProfile();

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/30 via-white to-white" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-emerald-100/30 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Tu clínica merece herramientas del 2026.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Configura tu clínica en minutos. Sin contratos. Cancela cuando quieras.
            IA incluida desde el primer día.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-8">
            <Link
              href="/register"
              onClick={() =>
                trackLanding("cta_trial_click", {
                  perfil: profile,
                  ubicacion: "final-cta",
                })
              }
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-xl gradient-primary px-10 text-base font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              Empezar mis 14 días gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Sin tarjeta. Planes desde S/129/mes cuando decidas quedarte.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
