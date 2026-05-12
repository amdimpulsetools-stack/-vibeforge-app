import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { paymentLimiter } from "@/lib/rate-limit";

/**
 * POST /api/billing/cancel
 *
 * Owner-only self-serve cancellation. Closes the loop the audit
 * flagged as P0 ("no DELETE on /api/mercadopago/subscription").
 *
 * Behaviour:
 *  - Calls MP `preApproval.update({ status: 'cancelled' })` so MP
 *    stops billing. If MP returns an error we abort and surface it
 *    — local + MP must stay in sync, otherwise the user keeps
 *    getting charged.
 *  - Stamps the DB row: status='cancelled', cancelled_at=NOW(),
 *    cancelled_by_user_id=auth.uid().
 *  - Access is NOT cut immediately: the middleware (mig 144) keeps
 *    `cancelled` rows alive as long as `mp_next_payment_date > NOW()`,
 *    so the user keeps Yenda until the period they already paid for
 *    ends.
 *  - Logs a `billing_events` row for audit.
 *
 * Returns: { ok, access_until, message }.
 *
 * Limitation: subscriptions without `mp_preapproval_id` (e.g. legacy
 * trial-only rows that never paid) can be cancelled DB-only — there's
 * nothing on MP to disable. We treat that as success.
 */
export async function POST() {
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

  // OWNER ONLY — billing is the most sensitive operation. We don't
  // allow admins to cancel even though they can change plans.
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
    return NextResponse.json({ error: "forbidden_owner_only" }, { status: 403 });
  }

  // Find the active subscription. We pick the most recent active|trialing|grace
  // — only those make sense to cancel. past_due implies MP already cut us off.
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("id, mp_preapproval_id, mp_next_payment_date, status, plan_id")
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

  // ── Step 1: cancel on MP first ────────────────────────────────
  if (sub.mp_preapproval_id) {
    try {
      const preApproval = getPreApprovalClient();
      await preApproval.update({
        id: sub.mp_preapproval_id,
        body: { status: "cancelled" },
      });
      console.log(`[billing/cancel] MP preApproval ${sub.mp_preapproval_id} cancelled`);
    } catch (error) {
      console.error("[billing/cancel] MP cancel failed:", error);
      return NextResponse.json(
        {
          error: "mp_cancel_failed",
          message:
            "No pudimos cancelar tu suscripción en Mercado Pago. Intenta de nuevo o contacta soporte.",
        },
        { status: 502 },
      );
    }
  }

  // ── Step 2: stamp the DB. We use the admin client because RLS on
  // organization_subscriptions only lets the original `user_id` UPDATE
  // (mig 003 policy), and we cancel by org membership — not by row owner.
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("organization_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by_user_id: user.id,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  if (updateErr) {
    console.error("[billing/cancel] DB update failed:", updateErr);
    return NextResponse.json(
      { error: "db_update_failed" },
      { status: 500 },
    );
  }

  await admin.from("billing_events").insert({
    organization_id: membership.organization_id,
    subscription_id: sub.id,
    event_type: "cancelled_by_user",
    metadata: {
      cancelled_by: user.id,
      previous_status: sub.status,
      access_until: sub.mp_next_payment_date,
      had_mp_preapproval: Boolean(sub.mp_preapproval_id),
    },
  });

  return NextResponse.json({
    ok: true,
    access_until: sub.mp_next_payment_date ?? null,
    message: sub.mp_next_payment_date
      ? "Suscripción cancelada. Mantienes acceso hasta el fin del período pagado."
      : "Suscripción cancelada.",
  });
}
