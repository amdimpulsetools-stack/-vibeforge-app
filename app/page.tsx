"use client";

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TrustBadges } from "@/components/landing/trust-badges";
import { GrowthPath } from "@/components/landing/growth-path";
import { PainPoints } from "@/components/landing/pain-points";
import { RoleSuperpowers } from "@/components/landing/role-superpowers";
import { Features } from "@/components/landing/features";
import { LiveNotifications } from "@/components/landing/live-notifications";
import { AIAssistant } from "@/components/landing/ai-assistant";
import { ExpectedResults } from "@/components/landing/expected-results";
import { RevenueImpact } from "@/components/landing/revenue-impact";
import { Pricing } from "@/components/landing/pricing";
import { SocialProof } from "@/components/landing/social-proof";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { ComingUpdates } from "@/components/landing/coming-updates";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white scroll-smooth">
      <Navbar />
      <Hero />
      <PainPoints />
      <TrustBadges />
      <GrowthPath />
      <RoleSuperpowers />
      <Features />
      <LiveNotifications />
      <AIAssistant />
      <ExpectedResults />
      <RevenueImpact />
      <Pricing />
      <SocialProof />
      <ComingUpdates />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
