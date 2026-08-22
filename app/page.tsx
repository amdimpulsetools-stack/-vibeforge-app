"use client";

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
import { Pricing } from "@/components/landing/pricing";
import { AlwaysImproving } from "@/components/landing/always-improving";
import { SocialProof } from "@/components/landing/social-proof";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

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
