"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { STICKY_MICROCOPY, V2_VARIANT } from "./content";
import { Arrow, btnPrimary } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Barra de CTA fija inferior, solo móvil (misma mecánica que la de la
 * home; aquí para que el evento lleve `variante: "2"`). Aparece tras
 * pasar el hero y respeta el safe-area de iOS.
 */
export function StickyCtaV2() {
  const [visible, setVisible] = useState(false);
  const profile = useLandingProfile();
  const trial = LANDING_CTAS.trial;

  useEffect(() => {
    let raf: number | null = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setVisible(window.scrollY > 600);
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-standard)] md:hidden",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <Link
          href={trial.href}
          onClick={() => trackLanding(trial.event, { perfil: profile, ubicacion: "sticky", variante: V2_VARIANT })}
          className={cn(btnPrimary, "w-full")}
        >
          {trial.label} <Arrow />
        </Link>
        <p className="mt-1.5 text-center text-[11px] text-slate-500">{STICKY_MICROCOPY}</p>
      </div>
    </div>
  );
}
