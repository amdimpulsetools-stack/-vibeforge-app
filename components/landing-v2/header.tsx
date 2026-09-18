"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { YendaLogo } from "@/components/icons/yenda-logo";
import { APP_NAME } from "@/lib/constants";
import { trackLanding } from "@/lib/landing-analytics";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { NAV_LINKS, V2_VARIANT } from "./content";
import { Arrow, Container, btnPrimary, btnSmall } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Cabecera de `/2`: pegajosa, con anclas a las secciones de la misma página
 * (la referencia navega dentro de la landing, no hacia el mega-menú de
 * producto), "Ingresar" y el CTA de prueba. En móvil, menú desplegable con
 * los mismos enlaces; Escape lo cierra.
 */
export function HeaderV2() {
  const [open, setOpen] = useState(false);
  const profile = useLandingProfile();
  const trial = LANDING_CTAS.trial;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const track = (ubicacion: string) =>
    trackLanding(trial.event, { perfil: profile, ubicacion, variante: V2_VARIANT });

  return (
    <header className="sticky top-0 z-40 border-b border-slate-900/[0.07] bg-white/90 backdrop-blur-xl">
      <Container className="flex h-[72px] items-center justify-between gap-6 lg:h-[84px]">
        <Link href="/2" aria-label={APP_NAME} className="flex shrink-0 items-center">
          <YendaLogo width={104} priority />
        </Link>

        <nav aria-label="Secciones" className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13.5px] font-medium text-slate-700 transition-colors hover:text-emerald-700"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/login"
            className="hidden items-center gap-1.5 text-[13.5px] font-medium text-slate-700 transition-colors hover:text-emerald-700 sm:inline-flex"
          >
            Ingresar <Arrow />
          </Link>
          <Link
            href={trial.href}
            onClick={() => track("navbar")}
            className={cn(btnPrimary, btnSmall, "gap-2")}
          >
            Empezar ahora <Arrow />
          </Link>
          <button
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="nav-movil"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-9 flex-col items-center justify-center gap-1.5 lg:hidden"
          >
            <span
              className={cn(
                "h-[1.5px] w-5 bg-slate-900 transition-transform duration-[var(--dur-base)]",
                open && "translate-y-[3.75px] rotate-45"
              )}
            />
            <span
              className={cn(
                "h-[1.5px] w-5 bg-slate-900 transition-transform duration-[var(--dur-base)]",
                open && "-translate-y-[3.75px] -rotate-45"
              )}
            />
          </button>
        </div>
      </Container>

      <div
        id="nav-movil"
        hidden={!open}
        className="border-b border-slate-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.06)] lg:hidden"
      >
        <Container className="flex flex-col gap-1 py-4">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-3 text-[15px] font-medium text-slate-800 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-3 text-[15px] font-medium text-slate-800 hover:bg-emerald-50 hover:text-emerald-800 sm:hidden"
          >
            Ingresar
          </Link>
        </Container>
      </div>
    </header>
  );
}
