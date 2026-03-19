import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseWebhookStatusUpdates,
  verifyWebhookChallenge,
} from "@/lib/whatsapp/webhook";
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
 * POST /api/whatsapp/webhook
 * Receives delivery status updates from Meta.
 */
export async function POST(req: NextRequest) {
  let payload: MetaWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates = parseWebhookStatusUpdates(payload);

  if (updates.length === 0) {
    // Acknowledge the webhook even if no status updates
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

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

  return NextResponse.json({ received: true, processed: updates.length });
}
