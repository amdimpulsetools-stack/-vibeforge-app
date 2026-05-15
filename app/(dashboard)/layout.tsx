import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AiAssistantPanel } from "@/components/ai-assistant-panel";
import { OrganizationProvider } from "@/components/organization-provider";
import { PlanLimitWarner } from "@/components/plan-limit-warner";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { TourAutostart } from "@/components/onboarding/tour-autostart";
import { SessionRegister } from "@/components/auth/session-register";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check — defense-in-depth alongside middleware
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // MFA gate — defense in depth against any auth flow that
  // forgets to route through /auth/mfa-challenge (OAuth used to
  // do this before the 2026-05-14 callback fix). If the user has
  // enrolled MFA but their session is still AAL1, force them to
  // complete the challenge before serving any dashboard page.
  //
  // getAuthenticatorAssuranceLevel returns { currentLevel,
  // nextLevel }. When nextLevel > currentLevel, a step-up is
  // pending. Specifically: aal2 needed, aal1 active.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (
    aal &&
    aal.currentLevel === "aal1" &&
    aal.nextLevel === "aal2"
  ) {
    redirect("/auth/mfa-challenge?next=/dashboard");
  }

  return (
    <OrganizationProvider>
      <MobileNavProvider>
        <TourProvider>
          <PlanLimitWarner />
          <TourAutostart />
          <SessionRegister />
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar />
              <main className="flex-1 overflow-auto p-4 md:p-7">{children}</main>
            </div>
            <AiAssistantPanel />
          </div>
        </TourProvider>
      </MobileNavProvider>
    </OrganizationProvider>
  );
}
