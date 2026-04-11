import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AiAssistantPanel } from "@/components/ai-assistant-panel";
import { OrganizationProvider } from "@/components/organization-provider";
import { PlanLimitWarner } from "@/components/plan-limit-warner";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
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

  return (
    <OrganizationProvider>
      <MobileNavProvider>
        <PlanLimitWarner />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto p-4 md:p-7">{children}</main>
          </div>
          <AiAssistantPanel />
        </div>
      </MobileNavProvider>
    </OrganizationProvider>
  );
}
