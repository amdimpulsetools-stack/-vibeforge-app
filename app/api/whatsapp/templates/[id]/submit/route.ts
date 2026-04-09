import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { submitTemplateToMeta } from "@/lib/whatsapp/templates";
import { decrypt } from "@/lib/encryption";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";

export const runtime = "nodejs";

/**
 * POST /api/whatsapp/templates/[id]/submit
 * Submits a template to Meta for review.
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

  if (!["DRAFT", "REJECTED"].includes(template.status)) {
    return NextResponse.json(
      { error: "Solo se pueden enviar plantillas en borrador o rechazadas" },
      { status: 400 }
    );
  }

  // Fetch WhatsApp config
  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("id, access_token, waba_id, phone_number_id")
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
    const { metaTemplateId } = await submitTemplateToMeta(client, waTemplate);

    // Update template status
    await supabase
      .from("whatsapp_templates")
      .update({
        meta_template_id: metaTemplateId,
        status: "PENDING",
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      metaTemplateId,
      status: "PENDING",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al enviar a Meta";
    console.error("[WhatsApp Submit]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
