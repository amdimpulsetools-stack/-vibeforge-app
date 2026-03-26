import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { syncTemplateStatus } from "@/lib/whatsapp/templates";
import { decrypt } from "@/lib/encryption";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";

export const runtime = "nodejs";

/**
 * POST /api/whatsapp/templates/[id]/sync
 * Syncs template status from Meta.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
  }

  // Fetch template
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  // Fetch WhatsApp config
  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("organization_id", member.organization_id)
    .single();

  if (!config?.access_token || !config?.waba_id || !config?.phone_number_id) {
    return NextResponse.json(
      { error: "Configuración de WhatsApp incompleta" },
      { status: 400 }
    );
  }

  const client = new WhatsAppClient({
    accessToken: decrypt(config.access_token),
    wabaId: config.waba_id,
    phoneNumberId: config.phone_number_id,
  });

  try {
    const waTemplate = template as unknown as WhatsAppTemplate;
    const { status, rejectionReason } = await syncTemplateStatus(client, waTemplate);

    const updatePayload: Record<string, unknown> = {
      status,
      last_synced_at: new Date().toISOString(),
    };

    if (rejectionReason) {
      updatePayload.rejection_reason = rejectionReason;
    }

    if (status === "APPROVED" || status === "REJECTED") {
      updatePayload.reviewed_at = new Date().toISOString();
    }

    await supabase
      .from("whatsapp_templates")
      .update(updatePayload)
      .eq("id", id);

    return NextResponse.json({
      success: true,
      status,
      rejectionReason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al sincronizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
