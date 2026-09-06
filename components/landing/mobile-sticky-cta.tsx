"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";

/**
 * Barra de CTA fija inferior, solo móvil. Con ~8,000px de scroll y el
 * pricing en la posición 10, un visitante convencido a media página tenía
 * que scrollear a ciegas hasta encontrar un botón. Aparece tras pasar el
 * hero (600px) y respeta el safe-area de iOS (viewportFit: "cover" ya está
 * configurado en el layout).
 *
 * Lleva el MISMO CTA primario que el hero —la prueba gratis, igual en los
 * tres perfiles—: dos botones con destinos distintos en la misma pantalla se
 * leen como dos ofertas distintas. El perfil solo viaja en el evento.
 */
export function MobileStickyCta() {
  const [visible, setVisible] = useState(false);
  const profile = useLandingProfile();
  const cta = LANDING_CTAS.trial;

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
      className={`fixed inset-x-0 bottom-0 z-40 md:hidden transition-transform duration-[var(--dur-slow)] ease-[var(--ease-standard)] ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3">
        <Link
          href={cta.href}
          onClick={() =>
            trackLanding(cta.event, { perfil: profile, ubicacion: "sticky" })
          }
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-white shadow-lg active:scale-[0.98] transition-transform"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-1.5 text-center text-[11px] text-slate-500">
          Sin tarjeta · Desde S/129 al mes · Cancela cuando quieras
        </p>
      </div>
    </div>
  );
}
