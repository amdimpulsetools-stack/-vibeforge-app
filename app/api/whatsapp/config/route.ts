import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { decrypt } from "@/lib/encryption";
import { maskWhatsAppConfig, upsertWhatsAppConfig } from "@/lib/whatsapp/config-store";
import { z } from "zod";

const whatsappConfigSchema = z.object({
  waba_id: z.string().min(1).optional(),
  phone_number_id: z.string().min(1).optional(),
  access_token: z.string().min(1).optional(),
  webhook_verify_token: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/config
 * Returns the WhatsApp configuration for the user's organization.
 */
export async function GET() {
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

  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  // Return config without secrets (access_token / register_pin) for security
  if (config) {
    return NextResponse.json(maskWhatsAppConfig(config));
  }

  return NextResponse.json(null);
}

/**
 * PUT /api/whatsapp/config
 * Creates or updates the WhatsApp configuration.
 */
export async function PUT(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = whatsappConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // Guardado por el camino único (cifrado incluido) — compartido con el
  // Embedded Signup. El wizard manual marca connected_via='manual' solo
  // cuando toca credenciales, para no pisar una conexión hecha vía popup
  // con un simple toggle de is_active.
  const validated = parsed.data;
  const touchesCredentials =
    (validated.access_token !== undefined && validated.access_token !== "••••••••") ||
    validated.waba_id !== undefined ||
    validated.phone_number_id !== undefined;

  const { data, error } = await upsertWhatsAppConfig(supabase, member.organization_id, {
    ...validated,
    ...(touchesCredentials ? { connected_via: "manual" as const } : {}),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(maskWhatsAppConfig(data));
}

/**
 * DELETE /api/whatsapp/config
 * Desvincula la cuenta de WhatsApp Business: elimina la fila de
 * credenciales (token cifrado incluido). Las plantillas
 * (whatsapp_templates) y el historial (whatsapp_message_logs) se
 * CONSERVAN a propósito: re-vincular la misma WABA los reutiliza, y
 * la auditoría de mensajes enviados no debe perderse. Sin config
 * activa, todo el pipeline automático (cron, notificaciones) salta el
 * canal WhatsApp por sus guards existentes — el apagado viene gratis.
 */
export async function DELETE() {
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

  const { error } = await supabase
    .from("whatsapp_config")
    .delete()
    .eq("organization_id", member.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/whatsapp/config
 * Verifies the connection to Meta API.
 */
export async function POST() {
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

  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("id, access_token, waba_id, phone_number_id")
    .eq("organization_id", member.organization_id)
    .single();

  if (!config?.access_token || !config?.waba_id || !config?.phone_number_id) {
    return NextResponse.json(
      { error: "Configuración incompleta. Completa WABA ID, Phone Number ID y Access Token." },
      { status: 400 }
    );
  }

  const client = new WhatsAppClient({
    accessToken: decrypt(config.access_token),
    wabaId: config.waba_id,
    phoneNumberId: config.phone_number_id,
  });

  const result = await client.verifyConnection();

  if (result.verified) {
    // Update verification status
    await supabase
      .from("whatsapp_config")
      .update({ business_verified: true, is_active: true })
      .eq("id", config.id);
  }

  return NextResponse.json(result);
}
