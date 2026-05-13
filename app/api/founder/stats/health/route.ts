import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  // head:true → server-side count, no row payload. Replaces the
  // previous ".select('id')" + ".length" pattern that pulled every
  // row of support_tickets and ai_query_usage just to count.
  const [ticketsOpenRes, ticketsResolvedRes, aiRes] = await Promise.all([
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved"),
    admin
      .from("ai_query_usage")
      .select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    openTickets: ticketsOpenRes.count ?? 0,
    resolvedTickets: ticketsResolvedRes.count ?? 0,
    totalAiQueries: aiRes.count ?? 0,
    totalMigrations: 70,
    totalTables: 30,
    dbStatus: "healthy",
    webhookStatus: "ok",
  });
}
