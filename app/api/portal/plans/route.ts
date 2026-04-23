import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Returns the patient's active/paused treatment plans with computed balance.
// Kept read-only for the portal; patients cannot trigger payments from here.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const session = await getPortalSession(slug);
  if (!session || !session.patient_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: plans } = await supabase
    .from("treatment_plans")
    .select(
      "id, title, status, total_sessions, treatment_plan_items(quantity, unit_price), treatment_sessions(status, session_price, appointment_id)"
    )
    .eq("patient_id", session.patient_id)
    .eq("organization_id", session.organization_id)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false });

  if (!plans || plans.length === 0) {
    return NextResponse.json({ plans: [] });
  }

  const planIds = plans.map((p) => p.id);
  const { data: payments } = await supabase
    .from("patient_payments")
    .select("treatment_plan_id, amount")
    .in("treatment_plan_id", planIds);

  const paidByPlan = new Map<string, number>();
  for (const p of payments ?? []) {
    if (!p.treatment_plan_id) continue;
    paidByPlan.set(
      p.treatment_plan_id,
      (paidByPlan.get(p.treatment_plan_id) ?? 0) + Number(p.amount)
    );
  }

  const result = plans.map((p) => {
    const items =
      (p as unknown as {
        treatment_plan_items?: { quantity: number; unit_price: number }[];
      }).treatment_plan_items ?? [];
    const sessions =
      (p as unknown as {
        treatment_sessions?: {
          status: string;
          session_price: number | null;
          appointment_id: string | null;
        }[];
      }).treatment_sessions ?? [];

    const total = items.reduce(
      (s, it) => s + Number(it.unit_price) * Number(it.quantity),
      0
    );
    const completed = sessions.filter((s) => s.status === "completed");
    const consumed = completed.reduce(
      (s, c) => s + Number(c.session_price ?? 0),
      0
    );
    const paid = paidByPlan.get(p.id) ?? 0;

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      total_sessions: p.total_sessions ?? 0,
      completed_sessions: completed.length,
      total_budget: total,
      paid,
      consumed,
      pending: Math.max(0, total - paid),
    };
  });

  return NextResponse.json({ plans: result });
}
