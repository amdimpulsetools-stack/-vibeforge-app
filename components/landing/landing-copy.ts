/**
 * Copy de la landing que viaja entre componentes (hero, sticky CTA, motor de
 * seguimientos). Módulo sin "use client" a propósito: lo pueden importar
 * tanto Server Components como los clientes que usan el hook de perfil.
 */

// ── Perfil del visitante ────────────────────────────────────────────────────
// Tres perfiles = las tres formas de comprar (doctor solo, centro, clínica).
// El default es "clinica": es el ticket más alto, y es lo que renderiza el
// servidor — sin un default fijo, el SSR tendría que adivinar y el layout
// saltaría al hidratar.

export const LANDING_PROFILES = ["doctor", "centro", "clinica"] as const;

export type LandingProfile = (typeof LANDING_PROFILES)[number];

export const DEFAULT_LANDING_PROFILE: LandingProfile = "clinica";

export function isLandingProfile(value: unknown): value is LandingProfile {
  return (
    typeof value === "string" &&
    (LANDING_PROFILES as readonly string[]).includes(value)
  );
}

// ── Titulares ───────────────────────────────────────────────────────────────
// El H1 es fijo (no rota, brief "No hacer"): solo la segunda oración lleva el
// gradiente `agenda-inteligente`.

export const HERO_HEADLINE = {
  lead: "Los demás sistemas guardan citas.",
  highlight: "Yenda trae de vuelta a las pacientes que dejaron de venir.",
} as const;

/**
 * Titular del hero hasta el 2026-09-05. NO se borra: va a
 * /doctor-independiente cuando exista esa página de vertical (brief ítem 5),
 * donde el dolor "Excel + cuaderno + WhatsApp" sigue siendo el correcto.
 */
export const LEGACY_HERO_HEADLINE = {
  lead: "Tu clínica no se cae por falta de pacientes. Se cae entre",
  highlight: "el Excel, el cuaderno y tu WhatsApp",
  tail: ".",
  plain:
    "Tu clínica no se cae por falta de pacientes. Se cae entre el Excel, el cuaderno y tu WhatsApp.",
} as const;

// ── CTAs ────────────────────────────────────────────────────────────────────

export type LandingCtaId = "demo" | "trial";

export const LANDING_CTAS: Record<
  LandingCtaId,
  { label: string; href: string; event: "cta_demo_click" | "cta_trial_click" }
> = {
  demo: {
    label: "Agenda una demo de 20 minutos",
    href: "/contacto?tipo=demo",
    event: "cta_demo_click",
  },
  trial: {
    label: "Empezar mis 14 días gratis",
    href: "/register",
    event: "cta_trial_click",
  },
};

// ── Contenido por perfil ────────────────────────────────────────────────────
// Solo cambian el subtítulo y la presencia del CTA secundario (la demo). El
// H1, el CTA primario y el mockup NO cambian: mover el bloque más alto de la
// página al tocar un chip haría saltar el layout justo donde el visitante
// está leyendo, y un primario distinto por perfil parte el embudo en dos.
//
// Prohibido en estos textos: "la contacta automáticamente" (el envío
// automático está pausado, con humano en el loop y App Review de Meta
// pendiente) y "cuánto facturaron" (todavía no hay pantalla que muestre
// facturación atribuida a la recuperación).

export interface LandingProfileContent {
  /** Texto del chip del segmentador */
  label: string;
  /** El único texto largo del hero que cambia con el perfil */
  subtitle: string;
  /**
   * El CTA primario es "Empezar mis 14 días gratis" en los TRES perfiles:
   * el registro es la conversión que queremos y partir el tráfico entre dos
   * destinos primarios distintos hacía imposible leer el embudo.
   */
  primary: LandingCtaId;
  /**
   * La demo solo se le ofrece a quien tiene equipo (centro y clínica): al
   * doctor independiente, que compra solo y en el momento, un "agenda una
   * demo" le suma una semana de fricción. `null` = sin CTA secundario.
   */
  secondary: LandingCtaId | null;
}

export const LANDING_PROFILE_CONTENT: Record<
  LandingProfile,
  LandingProfileContent
> = {
  doctor: {
    label: "Soy doctor independiente",
    subtitle:
      "Tu agenda, tu historia clínica y tus recordatorios de WhatsApp en una sola pantalla. Y cuando una paciente deja de venir, Yenda te avisa para que la contactes en un clic. Boletas SUNAT incluidas.",
    primary: "trial",
    secondary: null,
  },
  centro: {
    label: "Tengo un centro médico",
    subtitle:
      "Varios doctores, varios consultorios, una sola agenda. Yenda detecta a la paciente que no volvió, te avisa para contactarla por WhatsApp en un clic y deja registro de cuáles regresaron. Historia clínica, caja y boletas SUNAT incluidas.",
    primary: "trial",
    secondary: "demo",
  },
  clinica: {
    label: "Dirijo una clínica",
    subtitle:
      "Yenda detecta a la paciente que no agendó su siguiente control, te avisa para contactarla por WhatsApp en un clic y deja registro de cuáles volvieron. Agenda multi-doctor, historia clínica, caja y boletas SUNAT incluidas.",
    primary: "trial",
    secondary: "demo",
  },
};
