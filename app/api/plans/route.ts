import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/plans — list all active plans (public catalog)
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/plans/select — assign a plan to the user's org
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan_id } = await request.json();

  if (!plan_id) {
    return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  // Only admins/owners can change plan
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify plan exists
  const { data: plan } = await supabase
    .from("plans")
    .select("id, slug")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Deactivate current subscription(s)
  await supabase
    .from("organization_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"]);

  // Create new subscription
  const { data: subscription, error: subError } = await supabase
    .from("organization_subscriptions")
    .insert({
      organization_id: membership.organization_id,
      plan_id: plan.id,
      status: plan.slug === "starter" ? "active" : "trialing",
      started_at: new Date().toISOString(),
      trial_ends_at:
        plan.slug !== "starter"
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          : null,
      expires_at: null,
    })
    .select()
    .single();

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  return NextResponse.json(subscription);
}
