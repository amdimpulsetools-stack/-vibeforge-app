import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTestPublicKey } from "@/lib/culqi/config";
import { PAYMENT_LINK_COLUMNS, type PaymentLinkRow } from "@/lib/culqi/reconcile";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const payPageLimiter = rateLimit({ max: 30, windowMs: 60 * 1000 });

/**
 * GET /api/pay/[token] — PÚBLICO (service role, como /api/book/[slug]).
 * Devuelve SOLO campos seguros para pintar la página de pago:
 *   { clinic_name, concept, amount, currency, status, public_key, is_test, expired }
 * NUNCA expone secret key, datos del paciente ni organization_id.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = payPageLimiter(`pay:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  if (!token || token.length < 21) {
    return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data } = await admin
    .from("payment_links")
    .select(PAYMENT_LINK_COLUMNS)
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  }
  const link = data as unknown as PaymentLinkRow;

  // pending vencido → persistir como expired (condicionado al status
  // para no pisar un pago que se confirme en paralelo).
  let status: PaymentLinkRow["status"] = link.status;
  if (link.status === "pending" && new Date(link.expires_at).getTime() < Date.now()) {
    await admin
      .from("payment_links")
      .update({ status: "expired" })
      .eq("id", link.id)
      .eq("status", "pending");
    status = "expired";
  }

  const [{ data: org }, { data: config }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", link.organization_id).maybeSingle(),
    admin
      .from("culqi_config")
      .select("public_key, enabled")
      .eq("organization_id", link.organization_id)
      .maybeSingle(),
  ]);

  const configRow = config as { public_key: string; enabled: boolean } | null;
  const publicKey =
    configRow && configRow.enabled && configRow.public_key ? configRow.public_key : null;

  return NextResponse.json({
    clinic_name: (org as { name: string } | null)?.name ?? "",
    concept: link.concept,
    amount: Number(link.amount),
    currency: link.currency,
    status,
    public_key: publicKey,
    is_test: publicKey ? isTestPublicKey(publicKey) : false,
    expired: status === "expired",
  });
}
