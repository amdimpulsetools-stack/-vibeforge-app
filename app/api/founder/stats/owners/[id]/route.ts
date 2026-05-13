import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;

  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  // For monthly chart (last 6 months) — we only need rows back to the
  // 1st of the month 5 months ago. The previous version pulled the
  // entire history of appointments/payments/patients for the org just
  // to filter in JS. For a clinic with years of data this was multi-
  // megabyte payloads + multi-second responses.
  const sixMonthsAgoIso = new Date(
    now.getFullYear(),
    now.getMonth() - 5,
    1,
  ).toISOString();

  const [
    orgRes,
    membersRes,
    subRes,
    apptsRes,
    paymentsRes,
    patientsRes,
    ticketsRes,
    notesRes,
    lifecycleRes,
    // Aggregate counts via head:true — server-side count, no rows
    // shipped back. Replaces fetching the entire ai_query_usage
    // table per org just to read `.length`.
    totalApptsCountRes,
    totalPatientsCountRes,
    totalAiQueriesCountRes,
  ] = await Promise.all([
    admin.from("organizations").select("*").eq("id", orgId).single(),
    admin.from("organization_members")
      .select("user_id, role, is_active, created_at")
      .eq("organization_id", orgId),
    admin.from("organization_subscriptions")
      .select("*, plans(*)")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin.from("appointments")
      .select("id, appointment_date, status, created_at")
      .eq("organization_id", orgId)
      .gte("appointment_date", sixMonthsAgoIso)
      .order("appointment_date", { ascending: false }),
    admin.from("patient_payments")
      .select("id, amount, payment_date, payment_method, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sixMonthsAgoIso)
      .order("created_at", { ascending: false }),
    admin.from("patients")
      .select("id, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sixMonthsAgoIso),
    admin.from("support_tickets")
      .select("id, subject, status, priority, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("founder_notes")
      .select("id, content, created_at, updated_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("owner_lifecycle_events")
      .select("id, event_type, metadata, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    admin.from("patients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    admin.from("ai_query_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  const org = orgRes.data;
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Owner profile — read email directly from user_profiles (populated
  // by handle_new_user). Previous version called
  // admin.auth.admin.getUserById() sequentially, adding ~300ms RTT.
  type OwnerProfileRow = {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };
  let ownerProfile: OwnerProfileRow | null = null;
  if (org.owner_id) {
    const { data: p } = await admin
      .from("user_profiles")
      .select("full_name, avatar_url, email")
      .eq("id", org.owner_id)
      .single();
    ownerProfile = (p ?? null) as OwnerProfileRow | null;
  }

  // Member profiles. Build a Map for O(1) lookup instead of .find()
  // per row.
  const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length > 0
    ? await admin
        .from("user_profiles")
        .select("id, full_name, avatar_url")
        .in("id", memberIds)
    : { data: [] };
  const memberProfileById = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  for (const p of memberProfiles ?? []) {
    memberProfileById.set(p.id as string, {
      full_name: p.full_name as string | null,
      avatar_url: p.avatar_url as string | null,
    });
  }
  const members = (membersRes.data ?? []).map((m) => {
    const p = memberProfileById.get(m.user_id as string);
    return { ...m, name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null };
  });

  const recentAppointments = apptsRes.data ?? [];
  const recentPatients = patientsRes.data ?? [];
  const recentPayments = paymentsRes.data ?? [];

  // Monthly stats over the last 6 months. Bucketed in a single
  // pass per array — O(n) instead of O(n × 6) of .filter calls.
  type MonthBucket = { label: string; appointments: number; revenue: number; new_patients: number };
  const monthBuckets: MonthBucket[] = [];
  const monthIndexByKey = new Map<string, number>();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthIndexByKey.set(key, monthBuckets.length);
    monthBuckets.push({
      label: d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
      appointments: 0,
      revenue: 0,
      new_patients: 0,
    });
  }

  const bucketKey = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  for (const a of recentAppointments) {
    const idx = monthIndexByKey.get(bucketKey(a.appointment_date as string) ?? "");
    if (idx !== undefined) monthBuckets[idx].appointments++;
  }
  for (const p of recentPatients) {
    const idx = monthIndexByKey.get(bucketKey(p.created_at as string) ?? "");
    if (idx !== undefined) monthBuckets[idx].new_patients++;
  }
  let recentRevenueSum = 0;
  for (const p of recentPayments) {
    recentRevenueSum += Number(p.amount ?? 0);
    const idx = monthIndexByKey.get(bucketKey(p.created_at as string) ?? "");
    if (idx !== undefined) monthBuckets[idx].revenue += Number(p.amount ?? 0);
  }

  const sub = subRes.data as Record<string, unknown> | null;
  const plan = sub?.plans as Record<string, unknown> | null;

  return NextResponse.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.organization_type,
      is_active: org.is_active,
      created_at: org.created_at,
    },
    owner: {
      id: org.owner_id,
      name: ownerProfile?.full_name ?? null,
      email: ownerProfile?.email ?? null,
      avatar_url: ownerProfile?.avatar_url ?? null,
    },
    subscription: sub
      ? {
          status: sub.status,
          plan_name: plan?.name ?? null,
          price_monthly: plan?.price_monthly ?? 0,
          billing_cycle: sub.billing_cycle,
          current_period_end: sub.current_period_end,
          trial_ends_at: sub.trial_ends_at,
          cancelled_at: sub.cancelled_at,
        }
      : null,
    team: members,
    stats: {
      // total_* counts come from server-side count queries (head:true).
      // No row payload — just the integer.
      total_patients: totalPatientsCountRes.count ?? 0,
      total_appointments: totalApptsCountRes.count ?? 0,
      // total_revenue across all-time is no longer available without
      // a full payments scan; we expose the 6-month sum here. If you
      // need an all-time figure, add an aggregate RPC.
      total_revenue: recentRevenueSum,
      total_ai_queries: totalAiQueriesCountRes.count ?? 0,
      monthly: monthBuckets,
    },
    tickets: ticketsRes.data ?? [],
    notes: notesRes.data ?? [],
    lifecycle: lifecycleRes.data ?? [],
  });
}
