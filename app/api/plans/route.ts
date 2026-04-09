import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api-utils";
import { selectPlanSchema } from "@/lib/validations/api";

// GET /api/plans — list all active plans (public catalog)
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("Plans fetch error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
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

  const parsed = await parseBody(request, selectPlanSchema);
  if (parsed.error) return parsed.error;
  const { plan_id } = parsed.data;

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
  const { error: deactivateError } = await supabase
    .from("organization_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"]);

  if (deactivateError) {
    console.error("Deactivate subscription error:", deactivateError);
    return NextResponse.json(
      { error: "subscription_deactivation_failed" },
      { status: 500 }
    );
  }

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
    console.error("Subscription creation error:", subError);
    return NextResponse.json({ error: "subscription_creation_failed" }, { status: 500 });
  }

  return NextResponse.json(subscription);
}
