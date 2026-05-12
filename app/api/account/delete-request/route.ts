import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentLimiter } from "@/lib/rate-limit";
import {
  sendAccountDeletionRequestedEmail,
  resolveBillingEmailContext,
} from "@/lib/billing-emails";

/**
 * POST /api/account/delete-request
 *
 * Owner-only soft-delete request. The actual anonymization runs 30
 * days later via the cron. The owner can revert any time via
 * /api/account/delete-cancel before the grace window closes.
 *
 * Pre-conditions enforced inside the RPC:
 *   - Caller is the org owner
 *   - The subscription is already cancelled (not active/trialing/grace)
 *   - The org is not already in a deletion state
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

  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    "request_org_deletion",
    { p_org_id: membership.organization_id },
  );

  if (rpcErr) {
    console.error("[account/delete-request] RPC error:", rpcErr);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }

  const result = (rpcResult ?? {}) as {
    ok: boolean;
    error?: string;
    message?: string;
    grace_until?: string;
  };

  if (!result.ok) {
    const status =
      result.error === "subscription_still_active" ? 400
      : result.error === "not_owner" ? 403
      : result.error === "already_deleted" ? 409
      : result.error === "org_not_found" ? 404
      : 400;
    return NextResponse.json(
      { error: result.error, message: result.message ?? null },
      { status },
    );
  }

  // Email confirmation (non-blocking — failure shouldn't roll back).
  try {
    const admin = createAdminClient();
    const ctx = await resolveBillingEmailContext(
      admin,
      membership.organization_id,
      null,
    );
    if (ctx) {
      ctx.graceUntil = result.grace_until ?? null;
      await sendAccountDeletionRequestedEmail(ctx);
    }
  } catch (err) {
    console.warn("[account/delete-request] email send failed:", err);
  }

  return NextResponse.json({
    ok: true,
    grace_until: result.grace_until,
    message:
      "Solicitud recibida. Tienes 30 días para revertir antes de que tus datos se anonimicen permanentemente.",
  });
}
