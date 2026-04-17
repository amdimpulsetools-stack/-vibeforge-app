import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // Fetch all data for this org
  const [
    orgRes,
    membersRes,
    subRes,
    patientsRes,
    apptsRes,
    paymentsRes,
    ticketsRes,
    notesRes,
    lifecycleRes,
    aiRes,
  ] = await Promise.all([
    admin.from("organizations").select("*").eq("id", orgId).single(),
    admin.from("organization_members").select("user_id, role, is_active, created_at").eq("organization_id", orgId),
    admin.from("organization_subscriptions").select("*, plans(*)").eq("organization_id", orgId).maybeSingle(),
    admin.from("patients").select("id, created_at").eq("organization_id", orgId),
    admin.from("appointments").select("id, appointment_date, status, created_at").eq("organization_id", orgId).order("appointment_date", { ascending: false }),
    admin.from("patient_payments").select("id, amount, payment_date, payment_method, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    admin.from("support_tickets").select("id, subject, status, priority, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    admin.from("founder_notes").select("id, content, created_at, updated_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    admin.from("owner_lifecycle_events").select("id, event_type, metadata, created_at").eq("organization_id", orgId).order("created_at", { ascending: true }),
    admin.from("ai_query_usage").select("id, created_at").eq("organization_id", orgId),
  ]);

  const org = orgRes.data;
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Fetch owner profile
  let ownerProfile = null;
  let ownerEmail = null;
  if (org.owner_id) {
    const { data: p } = await admin.from("user_profiles").select("full_name, avatar_url").eq("id", org.owner_id).single();
    ownerProfile = p;
    const { data: authData } = await admin.auth.admin.getUserById(org.owner_id);
    ownerEmail = authData?.user?.email ?? null;
  }

  // Member profiles
  const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length > 0
    ? await admin.from("user_profiles").select("id, full_name, avatar_url").in("id", memberIds)
    : { data: [] };

  const members = (membersRes.data ?? []).map((m) => {
    const p = (memberProfiles ?? []).find((mp) => mp.id === m.user_id);
    return { ...m, name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null };
  });

  const appointments = apptsRes.data ?? [];
  const patients = patientsRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  // Monthly stats (last 6 months)
  const monthlyStats = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = d.toISOString();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const label = d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });

    const monthAppts = appointments.filter(
      (a) => a.appointment_date >= monthStart && a.appointment_date <= monthEnd
    ).length;
    const monthRevenue = payments
      .filter((p) => p.created_at >= monthStart && p.created_at <= monthEnd)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const monthPatients = patients.filter(
      (p) => p.created_at >= monthStart && p.created_at <= monthEnd
    ).length;

    monthlyStats.push({ label, appointments: monthAppts, revenue: monthRevenue, new_patients: monthPatients });
  }

  const sub = subRes.data as Record<string, unknown> | null;
  const plan = sub?.plans as Record<string, unknown> | null;

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

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
      email: ownerEmail,
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
      total_patients: patients.length,
      total_appointments: appointments.length,
      total_revenue: totalRevenue,
      total_ai_queries: aiRes.data?.length ?? 0,
      monthly: monthlyStats,
    },
    tickets: (ticketsRes.data ?? []).slice(0, 10),
    notes: notesRes.data ?? [],
    lifecycle: lifecycleRes.data ?? [],
  });
}
