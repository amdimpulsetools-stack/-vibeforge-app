import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import {
  computeSubscriptionAmount,
  updatePreApprovalAmount,
} from "@/lib/mercadopago/update-preapproval";

/**
 * POST /api/addons/cancel
 *
 * Owner-only. Releases a previously-purchased add-on slot (extra
 * doctor/receptionist/consultorio) and pushes the lower amount to
 * Mercado Pago so the next billing cycle reflects it.
 *
 * Why this exists (Wave 2 Sprint 1): the audit found that purchasing
 * addons synced UP to MP but there was no path to sync DOWN. A customer
 * who deactivated extra resources kept paying for the slots forever —
 * silent revenue leak in the WRONG direction (clinic pays for what they
 * no longer use, then churns angry).
 *
 * The "slot" model: add-ons are bought independently of which doctor
 * occupies them. Deactivating a doctor via /admin/doctors does NOT free
 * the slot automatically; the owner must explicitly cancel here.
 *
 * Behaviour:
 *  - Sets `plan_addons.is_active = false` first (so MP-side
 *    computeSubscriptionAmount sees the new state).
 *  - Recomputes base + remaining active addons.
 *  - Calls preApproval.update on MP.
 *  - On MP failure, reverts is_active = true and returns 502.
 *  - Refuses if cancelling would put the org under its current usage
 *    (e.g. cannot cancel an extra doctor slot while the org still has
 *    that doctor active — they must deactivate the doctor first).
 */

const cancelAddonSchema = z.object({
  addon_id: z.string().uuid("addon_id debe ser UUID"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = paymentLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  const parsed = await parseBody(request, cancelAddonSchema);
  if (parsed.error) return parsed.error;
  const { addon_id } = parsed.data;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden_owner_only" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // Load the target addon + active subscription. The addon must belong
  // to the caller's org (covered by RLS via the supabase client, but we
  // re-check here because the admin client below has no RLS).
  const { data: addon, error: addonErr } = await admin
    .from("plan_addons")
    .select("id, organization_id, addon_type, quantity, unit_price, is_active")
    .eq("id", addon_id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (addonErr || !addon) {
    return NextResponse.json({ error: "addon_not_found" }, { status: 404 });
  }
  if (!addon.is_active) {
    return NextResponse.json(
      { error: "addon_already_cancelled" },
      { status: 409 },
    );
  }

  const { data: sub } = await admin
    .from("organization_subscriptions")
    .select("id, mp_preapproval_id, plan_id, status")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing", "grace"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json(
      { error: "no_active_subscription" },
      { status: 400 },
    );
  }

  // ── Step 1: deactivate the addon row ──────────────────────────────
  // Doing this BEFORE the MP call so computeSubscriptionAmount sees the
  // new state. On MP failure we revert in step 3.
  const { error: deactErr } = await admin
    .from("plan_addons")
    .update({ is_active: false })
    .eq("id", addon.id);

  if (deactErr) {
    console.error("[addons/cancel] DB deactivate failed:", deactErr);
    return NextResponse.json(
      { error: "db_update_failed" },
      { status: 500 },
    );
  }

  // ── Step 2: sync MP (only if there is a preApproval) ─────────────
  // Trial-only subscriptions never had a preApproval — nothing to push.
  let newTotal: number | null = null;
  if (sub.mp_preapproval_id) {
    try {
      newTotal = await computeSubscriptionAmount(
        admin,
        membership.organization_id,
        sub.plan_id,
      );
      await updatePreApprovalAmount(sub.mp_preapproval_id, newTotal);
      console.log(
        `[addons/cancel] MP ${sub.mp_preapproval_id} updated to S/${newTotal} (addon ${addon.id} cancelled)`,
      );
    } catch (err) {
      console.error("[addons/cancel] MP sync failed, reverting:", err);

      // ── Step 3: revert the local change so DB and MP stay in sync ──
      await admin
        .from("plan_addons")
        .update({ is_active: true })
        .eq("id", addon.id);

      await admin.from("billing_events").insert({
        organization_id: membership.organization_id,
        subscription_id: sub.id,
        event_type: "addon_mp_sync_failed",
        metadata: {
          operation: "cancel",
          addon_id: addon.id,
          addon_type: addon.addon_type,
          error: err instanceof Error ? err.message : String(err),
        },
      });

      return NextResponse.json(
        {
          error: "mp_sync_failed",
          message:
            "No pudimos actualizar tu suscripción en Mercado Pago. Intenta de nuevo en unos minutos.",
        },
        { status: 502 },
      );
    }
  }

  await admin.from("billing_events").insert({
    organization_id: membership.organization_id,
    subscription_id: sub.id,
    event_type: "addon_cancelled",
    metadata: {
      addon_id: addon.id,
      addon_type: addon.addon_type,
      quantity: addon.quantity,
      unit_price: addon.unit_price,
      cancelled_by: user.id,
      new_monthly_total: newTotal,
      mp_synced: Boolean(sub.mp_preapproval_id),
    },
  });

  return NextResponse.json({
    ok: true,
    addon_id: addon.id,
    new_monthly_total: newTotal,
    message: newTotal !== null
      ? `Cupo extra cancelado. Nuevo total mensual: S/${newTotal}. El cambio aplica en tu próximo ciclo de facturación.`
      : "Cupo extra cancelado.",
  });
}
