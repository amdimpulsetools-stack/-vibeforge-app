import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, resolveVariableValues } from "@/lib/whatsapp/send";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";
import { z } from "zod";

const whatsappSendSchema = z.object({
  template_id: z.string().uuid(),
  recipient_phone: z.string().min(1),
  patient_id: z.string().uuid().optional(),
  appointment_id: z.string().uuid().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const runtime = "nodejs";

/**
 * POST /api/whatsapp/send
 * Sends a WhatsApp template message.
 *
 * Body:
 *   template_id: string — WhatsApp template UUID
 *   recipient_phone: string — Phone number with country code
 *   patient_id?: string — Patient UUID
 *   appointment_id?: string — Appointment UUID
 *   variables?: Record<string, string> — Variable values keyed by variable name
 */
export async function POST(req: NextRequest) {
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

  if (!member) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = whatsappSendSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Fetch approved template
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("id", body.template_id)
    .eq("organization_id", member.organization_id)
    .eq("status", "APPROVED")
    .single();

  if (!template) {
    return NextResponse.json(
      { error: "Plantilla no encontrada o no aprobada por Meta" },
      { status: 404 }
    );
  }

  // Fetch WhatsApp config
  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("organization_id", member.organization_id)
    .eq("is_active", true)
    .single();

  if (!config?.access_token || !config?.waba_id || !config?.phone_number_id) {
    return NextResponse.json(
      { error: "WhatsApp no configurado o inactivo" },
      { status: 400 }
    );
  }

  const client = new WhatsAppClient({
    accessToken: config.access_token,
    wabaId: config.waba_id,
    phoneNumberId: config.phone_number_id,
  });

  try {
    const waTemplate = template as unknown as WhatsAppTemplate;
    const variableValues = body.variables
      ? resolveVariableValues(waTemplate, body.variables)
      : {};

    const { wamid } = await sendWhatsAppMessage(
      client,
      waTemplate,
      body.recipient_phone,
      variableValues
    );

    // Log the message
    await supabase.from("whatsapp_message_logs").insert({
      organization_id: member.organization_id,
      template_id: template.id,
      recipient_phone: body.recipient_phone,
      patient_id: body.patient_id || null,
      appointment_id: body.appointment_id || null,
      wamid,
      status: "sent",
    });

    return NextResponse.json({ success: true, wamid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al enviar mensaje";
    console.error("[WhatsApp Send]", message);

    // Log the failure
    await supabase.from("whatsapp_message_logs").insert({
      organization_id: member.organization_id,
      template_id: template.id,
      recipient_phone: body.recipient_phone,
      patient_id: body.patient_id || null,
      appointment_id: body.appointment_id || null,
      status: "failed",
      error_message: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
