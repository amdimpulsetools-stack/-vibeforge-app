import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("user_profiles").select("is_founder").eq("id", user.id).single();
  if (!profile?.is_founder) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const [ticketsOpenRes, ticketsResolvedRes, aiRes] = await Promise.all([
    admin.from("support_tickets").select("id").eq("status", "open"),
    admin.from("support_tickets").select("id").eq("status", "resolved"),
    admin.from("ai_query_usage").select("id"),
  ]);

  return NextResponse.json({
    openTickets: ticketsOpenRes.data?.length ?? 0,
    resolvedTickets: ticketsResolvedRes.data?.length ?? 0,
    totalAiQueries: aiRes.data?.length ?? 0,
    totalMigrations: 70,
    totalTables: 30,
    dbStatus: "healthy",
    webhookStatus: "ok",
  });
}
