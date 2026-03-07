import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/plans/start-trial — start a 14-day trial for a plan
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
  let { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // Self-heal: if no org found, call ensure_user_has_org() to create one
  if (!membership) {
    const { error: healError } = await supabase.rpc("ensure_user_has_org");
    if (healError) {
      console.error("ensure_user_has_org error:", healError);
      return NextResponse.json({ error: "no_organization" }, { status: 400 });
    }

    // Re-fetch membership after self-healing
    const { data: newMembership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!newMembership) {
      return NextResponse.json({ error: "no_organization" }, { status: 400 });
    }
    membership = newMembership;
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify plan exists
  const { data: plan } = await supabase
    .from("plans")
    .select("id, slug, name")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Check for existing active/trialing subscription
  const { data: existing } = await supabase
    .from("organization_subscriptions")
    .select("id, status")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Ya tienes una suscripción activa" },
      { status: 409 }
    );
  }

  // Create trial subscription (14 days)
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: subscription, error: subError } = await supabase
    .from("organization_subscriptions")
    .insert({
      organization_id: membership.organization_id,
      plan_id: plan.id,
      status: "trialing",
      started_at: new Date().toISOString(),
      trial_ends_at: trialEnds,
      expires_at: trialEnds,
    })
    .select()
    .single();

  if (subError) {
    console.error("Trial creation error:", subError);
    return NextResponse.json(
      { error: "trial_creation_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(subscription);
}
