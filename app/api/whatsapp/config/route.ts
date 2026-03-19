import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppClient } from "@/lib/whatsapp/client";

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

  // Return config without access_token for security
  if (config) {
    return NextResponse.json({
      ...config,
      access_token: config.access_token ? "••••••••" : null,
    });
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    organization_id: member.organization_id,
  };

  // Only update fields that are provided
  if (typeof body.waba_id === "string") payload.waba_id = body.waba_id;
  if (typeof body.phone_number_id === "string") payload.phone_number_id = body.phone_number_id;
  if (typeof body.access_token === "string" && body.access_token !== "••••••••") {
    payload.access_token = body.access_token;
  }
  if (typeof body.webhook_verify_token === "string") {
    payload.webhook_verify_token = body.webhook_verify_token;
  }
  if (typeof body.is_active === "boolean") payload.is_active = body.is_active;

  const { data, error } = await supabase
    .from("whatsapp_config")
    .upsert(payload, { onConflict: "organization_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    access_token: data.access_token ? "••••••••" : null,
  });
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
    .select("*")
    .eq("organization_id", member.organization_id)
    .single();

  if (!config?.access_token || !config?.waba_id || !config?.phone_number_id) {
    return NextResponse.json(
      { error: "Configuración incompleta. Completa WABA ID, Phone Number ID y Access Token." },
      { status: 400 }
    );
  }

  const client = new WhatsAppClient({
    accessToken: config.access_token,
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
