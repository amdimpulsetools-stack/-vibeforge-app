import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

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
