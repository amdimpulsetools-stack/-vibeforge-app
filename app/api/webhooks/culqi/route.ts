import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcilePaidLink, PAYMENT_LINK_COLUMNS, type PaymentLinkRow } from "@/lib/culqi/reconcile";
import type { CulqiCharge } from "@/lib/culqi/client";
import { webhookLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

// F1 MÍNIMO pero idempotente. Cubre el caso "el cargo pasó en Culqi
// pero la respuesta HTTP a /api/pay/[token]/charge se perdió": si llega
// un cargo exitoso con metadata.payment_link_id y el link no está paid,
// se reconcilia igual que en la ruta de cobro (mismo claim atómico
// neq('paid') → jamás duplica el patient_payment).
//
// TODO(F3): endurecer — verificación de firma del webhook, cola de
// reintentos y registro de eventos crudos para auditoría. Hoy el riesgo
// es bajo: un payload forjado solo puede marcar paid un link cuyo id
// (uuid) conozca, y con un charge id inválido que la conciliación
// contable delataría.

/**
 * POST /api/webhooks/culqi — PÚBLICO.
 * Responde 200 siempre que el payload sea parseable (Culqi reintenta
 * los no-2xx); 400 solo si ni siquiera es JSON.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = webhookLimiter(`culqi-webhook:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  let event: Record<string, unknown>;
  try {
    event = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const eventType = typeof event.type === "string" ? event.type : "";

  // Solo nos interesan cargos exitosos. Culqi emite
  // 'charge.creation.succeeded' (el nombre exacto puede variar por
  // versión: aceptamos cualquier charge.*succe*).
  const isChargeSuccess =
    eventType.startsWith("charge.") && eventType.includes("succe");
  if (!isChargeSuccess) {
    return NextResponse.json({ received: true });
  }

  // `data` llega a veces como objeto y a veces como JSON string.
  let charge: CulqiCharge | null = null;
  const rawData = event.data;
  if (typeof rawData === "string") {
    try {
      charge = JSON.parse(rawData) as CulqiCharge;
    } catch {
      charge = null;
    }
  } else if (rawData && typeof rawData === "object") {
    charge = rawData as CulqiCharge;
  }

  const paymentLinkId = charge?.metadata?.payment_link_id;
  const chargeId = charge?.id;
  if (!charge || !paymentLinkId || !chargeId) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_links")
    .select(PAYMENT_LINK_COLUMNS)
    .eq("id", paymentLinkId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ received: true });
  }
  const link = data as unknown as PaymentLinkRow;

  if (link.status !== "paid") {
    const sourceId = charge.source?.id ?? "";
    await reconcilePaidLink(admin, link, {
      chargeId,
      method: sourceId.startsWith("ype_") ? "yape" : "tarjeta",
    });
  }

  return NextResponse.json({ received: true });
}
