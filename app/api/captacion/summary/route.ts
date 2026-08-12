import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/captacion/summary?org_id=...
 *
 * Datos del panel de Captación. Tres candados en orden:
 *   1. sesión válida y membresía en la org,
 *   2. grant del addon `captacion` (beta oculta — mig 207),
 *   3. recién entonces el RPC captacion_summary vía service role
 *      (el RPC no es ejecutable por clientes de navegador).
 *
 * Devuelve además si la org tiene número de WhatsApp conectado, para
 * que la página distinga "sin número" de "esperando datos".
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgIdParam = req.nextUrl.searchParams.get("org_id");

  // Membresía: con org_id explícito se valida esa; sin él, la primera
  // membresía del usuario (mismo criterio que /api/addons).
  let orgId = orgIdParam;
  if (orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "no_organization" }, { status: 403 });
    }
    orgId = membership.organization_id as string;
  }

  const admin = createAdminClient();

  const [{ data: grant }, { data: waConfig }] = await Promise.all([
    admin
      .from("organization_addons")
      .select("enabled")
      .eq("organization_id", orgId)
      .eq("addon_key", "captacion")
      .maybeSingle(),
    admin
      .from("whatsapp_config")
      .select("is_active, phone_number_id")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);

  if (!grant?.enabled) {
    return NextResponse.json({ error: "addon_not_enabled" }, { status: 403 });
  }

  const { data: summary, error } = await admin.rpc("captacion_summary", {
    p_org_id: orgId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    whatsapp_connected: Boolean(waConfig?.is_active && waConfig?.phone_number_id),
    summary,
    generated_at: new Date().toISOString(),
  });
}
