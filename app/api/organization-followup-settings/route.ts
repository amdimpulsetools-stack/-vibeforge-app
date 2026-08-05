import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActiveOrg } from "@/lib/followups/org-scope";
import type { OrganizationFollowupSettings } from "@/types/followups";

export const runtime = "nodejs";

/**
 * Ajustes de seguimientos por organización (`organization_followup_settings`,
 * mig 185).
 *
 * Solo se exponen los campos que HOY consume algo (el trigger de sesión
 * perdida, mig 187). `close_on_any_appointment` y `default_followup_days`
 * existen en la tabla pero son inertes — darles UI encendería
 * comportamiento que ningún código lee todavía.
 *
 * El rango 1..30 replica el CHECK `org_followup_settings_missed_delay_check`
 * para que el error llegue como 400 con mensaje y no como un 500 de Postgres.
 */
const settingsSchema = z.object({
  // Org activa del cliente (usuarios multi-org). Sin ella se cae al
  // fallback de primera membresía — ver lib/followups/org-scope.ts.
  organization_id: z.string().uuid().optional(),
  missed_session_followup: z.boolean(),
  missed_session_delay_days: z.number().int().min(1).max(30),
});

/**
 * GET /api/organization-followup-settings
 *
 * `configured: false` cuando la org NO tiene fila. Ese caso NO es
 * equivalente a "todo en false por defecto": la mig 185 no hace backfill
 * a propósito y los triggers leen con `COALESCE(flag, false)`, así que la
 * ausencia de fila ES el estado apagado. La UI lo distingue para poder
 * explicar qué pasa al activar por primera vez.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const org = await resolveActiveOrg(
    supabase,
    user.id,
    request.nextUrl.searchParams.get("org_id")
  );
  if (org.error) return org.error;

  const { data, error } = await supabase
    .from("organization_followup_settings")
    .select("missed_session_followup, missed_session_delay_days")
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: OrganizationFollowupSettings = {
    missed_session_followup: data?.missed_session_followup ?? false,
    missed_session_delay_days: data?.missed_session_delay_days ?? 3,
  };

  return NextResponse.json({ configured: !!data, settings });
}

/**
 * PUT /api/organization-followup-settings — upsert de la fila completa.
 *
 * Requiere owner/admin. La RLS de la mig 185 ya lo exige (`is_org_admin`),
 * pero comprobarlo aquí convierte un 403 de base en un error legible y
 * evita el modo de fallo "el upsert no escribe nada y la UI dice OK".
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { organization_id, ...settings }: { organization_id?: string } & OrganizationFollowupSettings =
    parsed.data;

  const org = await resolveActiveOrg(supabase, user.id, organization_id ?? null);
  if (org.error) return org.error;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", org.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("organization_followup_settings")
    .upsert(
      {
        organization_id: org.organizationId,
        ...settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configured: true, settings });
}
