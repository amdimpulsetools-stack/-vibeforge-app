import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api-utils";
import { selectPlanSchema } from "@/lib/validations/api";
import {
  computeSubscriptionAmount,
  updatePreApprovalAmount,
} from "@/lib/mercadopago/update-preapproval";

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

// POST /api/plans/select — assign a plan to the user's org.
//
// Wave 2 Sprint 1 (mig 148): when the org has an active MP preApproval
// (i.e. not a trial-only row), we push the new transaction_amount to MP
// BEFORE deactivating the old subscription. If MP rejects the update we
// abort with 502 — local DB and MP must stay in sync, otherwise MP keeps
// charging the OLD plan price on the next cycle while we show the new
// plan in the UI (silent revenue leak).
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
    .select("id, slug, price_monthly")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Find the current active/trialing subscription — we need its
  // mp_preapproval_id to push the price update to MP.
  const { data: currentSub } = await supabase
    .from("organization_subscriptions")
    .select("id, mp_preapproval_id, plan_id, status")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = createAdminClient();

  // ── Step 1: sync MP first (only if there is an active preApproval) ──
  // Trial-only subscriptions have no preApproval yet — no MP call needed.
  // A failed plan change here aborts the whole flow so MP never drifts.
  if (currentSub?.mp_preapproval_id) {
    try {
      const newAmount = await computeSubscriptionAmount(
        admin,
        membership.organization_id,
        plan.id,
      );
      await updatePreApprovalAmount(currentSub.mp_preapproval_id, newAmount);
      console.log(
        `[plans] MP preApproval ${currentSub.mp_preapproval_id} updated to S/${newAmount} for plan ${plan.slug}`,
      );
    } catch (err) {
      console.error("[plans] MP plan-change sync failed:", err);
      await admin.from("billing_events").insert({
        organization_id: membership.organization_id,
        subscription_id: currentSub.id,
        event_type: "plan_change_mp_sync_failed",
        metadata: {
          attempted_plan_id: plan.id,
          previous_plan_id: currentSub.plan_id,
          mp_preapproval_id: currentSub.mp_preapproval_id,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return NextResponse.json(
        {
          error: "mp_sync_failed",
          message:
            "No pudimos actualizar tu suscripción en Mercado Pago. Intenta de nuevo o contacta soporte.",
        },
        { status: 502 },
      );
    }
  }

  // ── Step 2: deactivate current subscription(s) ────────────────────
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

  // ── Step 3: create new subscription ────────────────────────────────
  // The new row carries the SAME mp_preapproval_id (MP keeps the same
  // contract, only the amount changed) and inherits payment cycle info.
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
      mp_preapproval_id: currentSub?.mp_preapproval_id ?? null,
    })
    .select()
    .single();

  if (subError) {
    console.error("Subscription creation error:", subError);
    return NextResponse.json({ error: "subscription_creation_failed" }, { status: 500 });
  }

  // ── Step 4: audit log ─────────────────────────────────────────────
  await admin.from("billing_events").insert({
    organization_id: membership.organization_id,
    subscription_id: subscription.id,
    event_type: "plan_changed",
    metadata: {
      changed_by: user.id,
      previous_plan_id: currentSub?.plan_id ?? null,
      previous_subscription_id: currentSub?.id ?? null,
      new_plan_id: plan.id,
      new_plan_slug: plan.slug,
      mp_synced: Boolean(currentSub?.mp_preapproval_id),
    },
  });

  return NextResponse.json(subscription);
}
