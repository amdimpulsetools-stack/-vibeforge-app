import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TrustBadges } from "@/components/landing/trust-badges";
import { StatusQuoTable } from "@/components/landing/status-quo-table";
import { MobileStickyCta } from "@/components/landing/mobile-sticky-cta";
import { PainQuiz } from "@/components/landing/pain-quiz";
import { RoleSuperpowers } from "@/components/landing/role-superpowers";
import { Features } from "@/components/landing/features";
import { AIAssistant } from "@/components/landing/ai-assistant";
import { RevenueImpact } from "@/components/landing/revenue-impact";
import { FollowupEngine } from "@/components/landing/followup-engine";
import { Pricing } from "@/components/landing/pricing";
import { AlwaysImproving } from "@/components/landing/always-improving";
import { SocialProof } from "@/components/landing/social-proof";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

// La home dejó de ser Client Component (nada aquí usaba estado; los hijos que
// sí lo usan ya llevan su propio "use client") para poder declarar el
// canonical: el segmentador del hero preselecciona por `?perfil=…` y sin este
// canonical cada variante entraría al índice como una home duplicada.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white scroll-smooth">
      <Navbar />
      <Hero />
      {/* Orden PAS (auditoría 2026-08-21): el dolor (hoy PainQuiz, antes el
          checklist PainPoints) se cuantifica de inmediato en soles
          (RevenueImpact) — antes había 7 secciones de features entre ambos y
          el calor se disipaba. El quiz además pre-carga los sliders de la
          calculadora al completarse. La prueba social va ANTES del precio;
          "Siempre mejorando" queda después del FAQ para que ningún
          "próximamente" toque el momento de decisión. */}
      <PainQuiz />
      <RevenueImpact />
      {/* El diferenciador va pegado a la calculadora: el visitante acaba de
          ver cuánta plata se le escapa y aquí encuentra el mecanismo que la
          recupera, antes de cualquier feature genérico. */}
      <FollowupEngine />
      <TrustBadges />
      <Features />
      <RoleSuperpowers />
      <AIAssistant />
      <StatusQuoTable />
      <SocialProof />
      <Pricing />
      <FAQ />
      <AlwaysImproving />
      <FinalCTA />
      <MobileStickyCta />
      <Footer />
    </div>
  );
}
