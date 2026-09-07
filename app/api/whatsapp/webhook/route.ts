import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseWebhookStatusUpdates,
  parseTemplateStatusUpdates,
  verifyWebhookChallenge,
} from "@/lib/whatsapp/webhook";
import {
  parseInboundMessages,
  persistInboundMessages,
} from "@/lib/whatsapp/capture";
import type { MetaWebhookPayload } from "@/lib/whatsapp/types";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/webhook
 * Webhook verification (Meta challenge).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Try environment variable first, then check DB
  let verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    // Look up from any org config (webhook is global)
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("whatsapp_config")
      .select("webhook_verify_token")
      .not("webhook_verify_token", "is", null)
      .limit(1)
      .single();

    verifyToken = data?.webhook_verify_token || undefined;
  }

  if (!verifyToken) {
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const result = verifyWebhookChallenge(mode, token, challenge, verifyToken);

  if (result.valid && result.challenge) {
    return new NextResponse(result.challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Process webhook payload — shared logic for both verified and unverified paths.
 */
async function handleWebhookPayload(payload: MetaWebhookPayload) {
  const updates = parseWebhookStatusUpdates(payload);
  // Estado de plantillas (APPROVED/REJECTED/…): sin esto el estado en
  // Yenda solo cambiaba al pulsar "Sincronizar" a mano.
  const templateUpdates = parseTemplateStatusUpdates(payload);
  // Captación F1: los mensajes ENTRANTES antes se descartaban aquí
  // (solo se procesaban statuses). Ahora se capturan en silencio —
  // best-effort, sin afectar jamás la vía de los acuses.
  const inbound = parseInboundMessages(payload);

  if (updates.length === 0 && inbound.length === 0 && templateUpdates.length === 0) {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  let captured = 0;
  if (inbound.length > 0) {
    try {
      captured = await persistInboundMessages(supabase, inbound);
    } catch (err) {
      console.error("[Captación] persistInboundMessages falló:", err);
    }
  }

  for (const update of updates) {
    const updatePayload: Record<string, unknown> = {
      status: update.status,
    };

    if (update.status === "delivered") {
      updatePayload.delivered_at = new Date(
        parseInt(update.timestamp) * 1000
      ).toISOString();
    } else if (update.status === "read") {
      updatePayload.read_at = new Date(
        parseInt(update.timestamp) * 1000
      ).toISOString();
    } else if (update.status === "failed") {
      updatePayload.error_code = update.errorCode || null;
      updatePayload.error_message = update.errorTitle || null;
    }

    await supabase
      .from("whatsapp_message_logs")
      .update(updatePayload)
      .eq("wamid", update.wamid);
  }

  for (const t of templateUpdates) {
    const patch: Record<string, unknown> = {
      status: t.status,
      last_synced_at: new Date().toISOString(),
    };
    if (t.status === "APPROVED" || t.status === "REJECTED") {
      patch.reviewed_at = new Date().toISOString();
    }
    patch.rejection_reason = t.status === "REJECTED" ? t.reason ?? null : null;

    // Una misma WABA puede servir a varias orgs (número de prueba
    // compartido durante el App Review): se actualiza por nombre, que es
    // único dentro de la cuenta, y por id de Meta cuando viene.
    let q = supabase.from("whatsapp_templates").update(patch);
    q = t.metaTemplateId
      ? q.eq("meta_template_id", t.metaTemplateId)
      : q.eq("meta_template_name", t.templateName);
    const { error } = await q;
    if (error) {
      console.error("[WhatsApp] estado de plantilla no aplicado:", error.message);
    }
  }

  return NextResponse.json({
    received: true,
    processed: updates.length,
    templates: templateUpdates.length,
    captured,
  });
}

/**
 * POST /api/whatsapp/webhook
 * Receives delivery status updates from Meta.
 * Validates X-Hub-Signature-256 when WHATSAPP_APP_SECRET is configured.
 */
export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    // Verify HMAC signature from Meta
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const body = await req.text();
    const { createHmac, timingSafeEqual } = await import("crypto");
    const expectedSig =
      "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");

    try {
      if (
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
      ) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return handleWebhookPayload(payload);
  }

  // No app secret configured — accept but warn in production
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[WhatsApp Webhook] WHATSAPP_APP_SECRET not set — signature verification disabled"
    );
  }

  let payload: MetaWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  return handleWebhookPayload(payload);
}
