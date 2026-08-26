import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledCulqiConfig } from "@/lib/culqi/config";
import { createCharge, paymentMethodForSource } from "@/lib/culqi/client";
import {
  PAYMENT_LINK_COLUMNS,
  reconcilePaidLink,
  type PaymentLinkRow,
} from "@/lib/culqi/reconcile";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Cobros: pocos intentos por IP — cada intento pega a Culqi.
const chargeLimiter = rateLimit({ max: 8, windowMs: 60 * 1000 });

const chargeSchema = z.object({
  // tkn_... (tarjeta) o ype_... (Yape), creados por el checkout de
  // Culqi en el NAVEGADOR — este backend jamás ve tarjetas.
  culqi_token_id: z.string().trim().min(10).max(64).regex(/^[A-Za-z0-9_]+$/),
  email: z.string().trim().email().max(254),
});

/**
 * POST /api/pay/[token]/charge — PÚBLICO.
 * Cobra el link con el token Culqi generado en el navegador.
 * El monto sale SIEMPRE de la BD, jamás del cliente.
 * Respuesta: { ok, status, user_message? }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = chargeLimiter(`pay-charge:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { ok: false, status: "pending", user_message: "Demasiados intentos. Espera un minuto." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "pending", user_message: "Solicitud inválida." },
      { status: 400 }
    );
  }
  const parsed = chargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, status: "pending", user_message: "Datos de pago inválidos." },
      { status: 400 }
    );
  }
  const { culqi_token_id: sourceId, email } = parsed.data;

  const admin = createAdminClient();

  // Relee el link con service role.
  const { data } = await admin
    .from("payment_links")
    .select(PAYMENT_LINK_COLUMNS)
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  }
  const link = data as unknown as PaymentLinkRow;

  if (link.status === "paid") {
    return NextResponse.json({ ok: true, status: "paid" });
  }
  if (link.status === "cancelled" || link.status === "expired") {
    return NextResponse.json({
      ok: false,
      status: link.status,
      user_message:
        link.status === "cancelled"
          ? "Este link de cobro fue anulado por la clínica."
          : "Este link de cobro ya venció. Pide uno nuevo a la clínica.",
    });
  }

  // pending pero vencido → persistir expired y no cobrar.
  if (new Date(link.expires_at).getTime() < Date.now()) {
    await admin
      .from("payment_links")
      .update({ status: "expired" })
      .eq("id", link.id)
      .eq("status", "pending");
    return NextResponse.json({
      ok: false,
      status: "expired",
      user_message: "Este link de cobro ya venció. Pide uno nuevo a la clínica.",
    });
  }

  // ── Anti doble-cobro: claim atómico pending → processing ─────────
  // Solo UNA petición gana el UPDATE condicionado; el doble clic o la
  // pestaña duplicada ven 0 filas y no llegan a Culqi.
  const { data: claimed } = await admin
    .from("payment_links")
    .update({ status: "processing" })
    .eq("token", token)
    .eq("status", "pending")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({
      ok: false,
      status: "processing",
      user_message: "Este pago ya está siendo procesado. Espera un momento y recarga la página.",
    });
  }

  const revertToPending = () =>
    admin
      .from("payment_links")
      .update({ status: "pending" })
      .eq("id", link.id)
      .eq("status", "processing");

  const culqi = await getEnabledCulqiConfig(link.organization_id);
  if (!culqi) {
    await revertToPending();
    return NextResponse.json({
      ok: false,
      status: "pending",
      user_message: "La clínica no tiene los pagos en línea habilitados en este momento.",
    });
  }

  // El monto SIEMPRE sale de la BD (céntimos, entero para Culqi).
  const amountCents = Math.round(Number(link.amount) * 100);

  const result = await createCharge({
    secretKey: culqi.secretKey,
    amountCents,
    email,
    sourceId,
    metadata: { payment_link_id: link.id },
  });

  if (!result.ok) {
    // Culqi rechazó (o timeout/red: `indeterminate`, en cuyo caso el
    // cargo pudo pasar — el webhook reconcilia y su claim neq('paid')
    // evita duplicados). En ambos casos el link vuelve a pending para
    // permitir el reintento.
    await revertToPending();
    return NextResponse.json({
      ok: false,
      status: "pending",
      user_message: result.userMessage,
    });
  }

  // Cargo OK → paid + patient_payment (el trigger de Caja hace el resto).
  const method = paymentMethodForSource(sourceId);
  await reconcilePaidLink(admin, link, {
    chargeId: result.charge.id,
    method,
  });

  return NextResponse.json({ ok: true, status: "paid" });
}
