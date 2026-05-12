import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paymentLimiter } from "@/lib/rate-limit";

/**
 * POST /api/account/delete-cancel
 *
 * Owner-only. Reverts a previously-requested soft-delete as long as
 * the 30-day grace window has not closed and the anonymization cron
 * has not already run on the row.
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
    "cancel_org_deletion",
    { p_org_id: membership.organization_id },
  );

  if (rpcErr) {
    console.error("[account/delete-cancel] RPC error:", rpcErr);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const result = (rpcResult ?? {}) as { ok: boolean; error?: string };

  if (!result.ok) {
    const status =
      result.error === "grace_period_expired" ? 410
      : result.error === "not_in_deletion" ? 409
      : result.error === "already_anonymized" ? 410
      : result.error === "not_owner" ? 403
      : result.error === "org_not_found" ? 404
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    message: "Eliminación revertida. Tu clínica está activa de nuevo.",
  });
}
