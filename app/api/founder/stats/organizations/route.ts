import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

// GET /api/founder/stats/organizations — all orgs (bypasses RLS)
export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  const [orgsRes, membersRes, subsRes] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, is_active, organization_type, created_at")
      .order("created_at", { ascending: false }),
    admin.from("organization_members").select("organization_id, role"),
    admin.from("organization_subscriptions").select("organization_id, status, plans(name)"),
  ]);

  const orgs = orgsRes.data ?? [];
  const members = membersRes.data ?? [];
  const subs = subsRes.data ?? [];

  // O(n) — index members + subs by organization_id once. The previous
  // version ran .filter() / .find() per org, quadratic for large
  // member/sub tables.
  const memberCountByOrg = new Map<string, number>();
  for (const m of members) {
    const id = m.organization_id as string;
    memberCountByOrg.set(id, (memberCountByOrg.get(id) ?? 0) + 1);
  }
  const subByOrg = new Map<string, (typeof subs)[number]>();
  for (const s of subs) subByOrg.set(s.organization_id as string, s);

  const enriched = orgs.map((org) => {
    const orgSub = subByOrg.get(org.id as string) as Record<string, unknown> | undefined;
    return {
      ...org,
      member_count: memberCountByOrg.get(org.id as string) ?? 0,
      subscription_status: (orgSub?.status as string) ?? null,
      plan_name: ((orgSub?.plans as Record<string, unknown>)?.name as string) ?? null,
    };
  });

  return NextResponse.json(enriched);
}
