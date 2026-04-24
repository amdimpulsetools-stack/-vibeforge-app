import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

// GET /api/founder/stats/organizations — all orgs (bypasses RLS)
export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  // Use admin client to bypass RLS
  const admin = createAdminClient();

  const [orgsRes, membersRes, subsRes] = await Promise.all([
    admin.from("organizations").select("id, name, slug, is_active, organization_type, created_at").order("created_at", { ascending: false }),
    admin.from("organization_members").select("organization_id, role"),
    admin.from("organization_subscriptions").select("organization_id, status, plans(name)"),
  ]);

  const orgs = orgsRes.data ?? [];
  const members = membersRes.data ?? [];
  const subs = subsRes.data ?? [];

  // Enrich orgs
  const enriched = orgs.map((org) => {
    const orgMembers = members.filter((m) => m.organization_id === org.id);
    const orgSub = subs.find((s) => s.organization_id === org.id) as Record<string, unknown> | undefined;

    return {
      ...org,
      member_count: orgMembers.length,
      subscription_status: orgSub?.status as string ?? null,
      plan_name: (orgSub?.plans as Record<string, unknown>)?.name as string ?? null,
    };
  });

  return NextResponse.json(enriched);
}
