import { createClient } from "@/lib/supabase/server";
import { NextResponse, after } from "next/server";
import { parseBody } from "@/lib/api-utils";
import { startTrialSchema } from "@/lib/validations/api";
import { sendTrialWelcomeEmail } from "@/lib/trial-welcome-email";

export const runtime = "nodejs";

// POST /api/plans/start-trial — start a 14-day trial for a plan
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, startTrialSchema);
  if (parsed.error) return parsed.error;
  const { plan_id } = parsed.data;

  // Get user's org
  let { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // Self-heal: if no org found, call ensure_user_has_org() to create one
  if (!membership) {
    const { data: rpcResult, error: healError } = await supabase.rpc("ensure_user_has_org");
    if (healError) {
      console.error("ensure_user_has_org error:", JSON.stringify(healError));
      return NextResponse.json(
        { error: "no_organization", detail: healError.message },
        { status: 400 }
      );
    }
    console.log("ensure_user_has_org result:", JSON.stringify(rpcResult));

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

  // Check for existing active/trialing subscription — those block a new trial
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

  // Clean up stale pending rows (from abandoned Mercado Pago checkouts, etc.)
  // so they don't clutter the table. Failures here are non-fatal.
  const { error: cleanupError } = await supabase
    .from("organization_subscriptions")
    .delete()
    .eq("organization_id", membership.organization_id)
    .in("status", ["pending", "expired", "canceled"]);

  if (cleanupError) {
    console.warn("[start-trial] cleanup of stale rows failed:", cleanupError.message);
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
    console.error("[start-trial] subscription insert failed:", JSON.stringify(subError));
    return NextResponse.json(
      {
        error: "trial_creation_failed",
        detail: subError.message,
        code: subError.code,
      },
      { status: 500 }
    );
  }

  // Send welcome email AFTER the response is sent, so it never blocks the
  // client. `after` runs in a post-response phase in Vercel's runtime and
  // swallows its own errors inside sendTrialWelcomeEmail.
  const ownerEmail = user.email;
  const organizationId = membership.organization_id;

  after(async () => {
    try {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      await sendTrialWelcomeEmail({
        supabase,
        organizationId,
        ownerEmail,
        ownerName: profile?.full_name ?? null,
      });
    } catch (err) {
      console.warn("[start-trial] welcome email failed:", err);
    }
  });

  return NextResponse.json(subscription);
}
