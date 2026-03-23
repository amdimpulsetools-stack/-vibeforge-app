"use client";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TrustBadges } from "@/components/landing/trust-badges";
import { GrowthPath } from "@/components/landing/growth-path";
import { PainPoints } from "@/components/landing/pain-points";
import { Features } from "@/components/landing/features";
import { AIAssistant } from "@/components/landing/ai-assistant";
import { Pricing } from "@/components/landing/pricing";
import { SocialProof } from "@/components/landing/social-proof";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white scroll-smooth">
      <Navbar />
      <Hero />
      <TrustBadges />
      <GrowthPath />
      <PainPoints />
      <Features />
      <AIAssistant />
      <Pricing />
      <SocialProof />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
