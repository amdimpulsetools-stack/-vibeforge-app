import type { Metadata } from "next";
import { HeaderV2 } from "@/components/landing-v2/header";
import { HeroV2 } from "@/components/landing-v2/hero";
import { EssentialsV2 } from "@/components/landing-v2/essentials";
import { FollowupWorkflowV2 } from "@/components/landing-v2/followup-workflow";
import { TeamRolesV2 } from "@/components/landing-v2/team-roles";
import { ImpactV2 } from "@/components/landing-v2/impact";
import { ProofV2 } from "@/components/landing-v2/proof";
import { PricingV2 } from "@/components/landing-v2/pricing";
import { FaqV2 } from "@/components/landing-v2/faq";
import { ClosingV2 } from "@/components/landing-v2/closing";
import { FooterV2 } from "@/components/landing-v2/footer";
import { StickyCtaV2 } from "@/components/landing-v2/sticky-cta";

/**
 * Landing paralela: la misma información, marca y precios de la home, con
 * otra estructura para iterar sin tocar `/`. Vive en `/2` hasta que la
 * reemplace. No se indexa (tampoco está en el sitemap y robots la
 * excluye) para que no compita con la home mientras se compara.
 */
export const metadata: Metadata = {
  title: { absolute: "Yenda — Software para clínicas y consultorios en Perú" },
  description:
    "Los demás sistemas guardan citas. Yenda detecta a la paciente que dejó de venir, te avisa para contactarla por WhatsApp y junta agenda, historia clínica, caja y boletas SUNAT. Desde S/129 al mes, 14 días gratis sin tarjeta.",
  robots: { index: false, follow: false },
};

export default function LandingV2Page() {
  return (
    <div className="min-h-screen bg-white text-slate-900 scroll-smooth">
      <HeaderV2 />
      <main>
        <HeroV2 />
        <EssentialsV2 />
        <FollowupWorkflowV2 />
        <TeamRolesV2 />
        <ImpactV2 />
        <ProofV2 />
        <PricingV2 />
        <FaqV2 />
        <ClosingV2 />
      </main>
      <StickyCtaV2 />
      <FooterV2 />
    </div>
  );
}
