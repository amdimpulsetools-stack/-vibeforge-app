import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentClient } from "@/lib/mercadopago/client";
import { paymentLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { requireFounder } from "@/lib/require-founder";
import {
  resolveBillingEmailContext,
  sendRefundIssuedEmail,
} from "@/lib/billing-emails";

/**
 * POST /api/founder/refund-payment
 *
 * Founder-only path to refund a payment captured in payment_history.
 * The audit flagged this as a P0 gap: MP-dashboard refunds were
 * invisible to Yenda, and there was no in-app way to issue one. A
 * support agent who promised "te devolvemos el cobro" had nothing
 * to click — they had to log into MP directly and the refund never
 * made it back into our records.
 *
 * Auth: `requireFounder()` enforces (1) Supabase session, (2)
 * is_founder=true, (3) valid 2FA cookie within the last 4 hours.
 * Matches every other /api/founder/* endpoint.
 *
 * Behaviour:
 *   1. Load the payment_history row and short-circuit if already
 *      refunded.
 *   2. Call MP `payment.refund({ id: mp_payment_id, amount? })`.
 *      MP accepts partial refunds if `amount` is provided.
 *   3. Stamp payment_history with refund metadata + source='founder_app'
 *      so the webhook (which also receives a payment.refunded event
 *      from MP afterwards) knows to skip the duplicate notification.
 *   4. Log `refund_issued` to billing_events.
 *   5. Send `refund_issued` email to the org owner.
 *
 * If MP rejects the refund we leave payment_history untouched and
 * log `refund_failed` so the founder can retry without a stale "in
 * progress" state.
 */

const refundSchema = z.object({
  payment_id: z.string().uuid("payment_id debe ser UUID"),
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const guard = await requireFounder();
  if ("error" in guard) return guard.error;

  // Light rate limit so a compromised founder session can't issue
  // hundreds of refunds in a tight loop.
  const rl = paymentLimiter(guard.userId);
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

  // We use a per-request supabase client only to parse the request;
  // all writes go through the admin client below.
  const supabase = await createClient();
  void supabase; // unused after auth; we keep the import for consistency

  const parsed = await parseBody(request, refundSchema);
  if (parsed.error) return parsed.error;
  const { payment_id, amount, reason } = parsed.data;

  const admin = createAdminClient();

  const { data: payment, error: paymentErr } = await admin
    .from("payment_history")
    .select(
      "id, organization_id, subscription_id, mp_payment_id, amount, currency, status, refunded_at",
    )
    .eq("id", payment_id)
    .maybeSingle();

  if (paymentErr || !payment) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }

  if (!payment.mp_payment_id) {
    return NextResponse.json(
      {
        error: "no_mp_payment_id",
        message: "Este pago no tiene mp_payment_id; no se puede reembolsar desde MP.",
      },
      { status: 400 },
    );
  }

  if (payment.status === "refunded" || payment.refunded_at) {
    return NextResponse.json(
      { error: "already_refunded", message: "Este pago ya fue reembolsado." },
      { status: 409 },
    );
  }

  if (payment.status !== "approved") {
    return NextResponse.json(
      {
        error: "payment_not_approved",
        message: `Solo se reembolsan pagos en estado 'approved'. Estado actual: ${payment.status}.`,
      },
      { status: 400 },
    );
  }

  const paidAmount = Number(payment.amount);
  const refundAmount = amount ?? paidAmount;
  if (refundAmount > paidAmount) {
    return NextResponse.json(
      {
        error: "refund_exceeds_paid",
        message: `No puedes reembolsar más de S/${paidAmount.toFixed(2)}.`,
      },
      { status: 400 },
    );
  }

  // ── Step 1: stamp DB BEFORE calling MP. The webhook for
  // payment.refunded fires asynchronously from MP and we want it to
  // see refund_source='founder_app' so it doesn't double-email the
  // owner. If MP rejects the refund we revert in the catch block.
  const nowIso = new Date().toISOString();
  const newStatus = refundAmount === paidAmount ? "refunded" : payment.status;

  const { error: stampErr } = await admin
    .from("payment_history")
    .update({
      status: newStatus,
      refunded_at: nowIso,
      refund_amount: refundAmount,
      refunded_by_user_id: guard.userId,
      refund_reason: reason ?? null,
      refund_source: "founder_app",
      updated_at: nowIso,
    })
    .eq("id", payment.id);

  if (stampErr) {
    console.error("[founder/refund-payment] pre-refund DB stamp failed:", stampErr);
    return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
  }

  // ── Step 2: ask MP to process the refund ─────────────────────────
  let mpRefund: unknown;
  try {
    const paymentClient = getPaymentClient();
    const refundBody =
      refundAmount === paidAmount ? undefined : { amount: refundAmount };
    mpRefund = await (paymentClient as unknown as {
      refund: (args: { id: string; body?: Record<string, unknown> }) => Promise<unknown>;
    }).refund({ id: payment.mp_payment_id, body: refundBody });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[founder/refund-payment] MP refund failed:", msg);

    // Roll back our pre-stamp so the DB is consistent again.
    await admin
      .from("payment_history")
      .update({
        status: payment.status,
        refunded_at: null,
        refund_amount: null,
        refunded_by_user_id: null,
        refund_reason: null,
        refund_source: null,
        updated_at: nowIso,
      })
      .eq("id", payment.id);

    await admin.from("billing_events").insert({
      organization_id: payment.organization_id,
      subscription_id: payment.subscription_id,
      event_type: "refund_failed",
      metadata: {
        payment_id: payment.id,
        mp_payment_id: payment.mp_payment_id,
        attempted_amount: refundAmount,
        attempted_by: guard.userId,
        reason: reason ?? null,
        error: msg,
      },
    });

    return NextResponse.json(
      {
        error: "mp_refund_failed",
        message:
          "Mercado Pago rechazó el reembolso. Revisa el dashboard de MP o intenta de nuevo.",
        details: msg,
      },
      { status: 502 },
    );
  }

  // ── Step 3: audit + email ────────────────────────────────────────
  await admin.from("billing_events").insert({
    organization_id: payment.organization_id,
    subscription_id: payment.subscription_id,
    event_type: "refund_issued",
    metadata: {
      payment_id: payment.id,
      mp_payment_id: payment.mp_payment_id,
      refunded_amount: refundAmount,
      original_amount: paidAmount,
      is_partial: refundAmount < paidAmount,
      issued_by: guard.userId,
      reason: reason ?? null,
      mp_refund_response: mpRefund as Record<string, unknown>,
    },
  });

  try {
    const ctx = await resolveBillingEmailContext(
      admin,
      payment.organization_id,
      payment.subscription_id,
    );
    if (ctx) {
      ctx.amount = `S/ ${refundAmount.toFixed(2)}`;
      await sendRefundIssuedEmail(ctx);
    }
  } catch (err) {
    console.warn("[founder/refund-payment] email send failed:", err);
  }

  return NextResponse.json({
    ok: true,
    payment_id: payment.id,
    refunded_amount: refundAmount,
    is_partial: refundAmount < paidAmount,
    message:
      refundAmount === paidAmount
        ? `Reembolso completo procesado: S/${refundAmount.toFixed(2)}.`
        : `Reembolso parcial procesado: S/${refundAmount.toFixed(2)} de S/${paidAmount.toFixed(2)}.`,
  });
}
