import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgTimezone, todayInTz, zonedNow } from "@/lib/org-time";
import { format, subDays } from "date-fns";

export const runtime = "nodejs";

/**
 * GET /api/captacion/summary?org_id=...&from=yyyy-MM-dd&to=yyyy-MM-dd
 *
 * Datos del panel de Captación. Tres candados en orden:
 *   1. sesión válida y membresía ACTIVA en la org,
 *   2. grant del addon `captacion` (beta oculta — mig 207),
 *   3. recién entonces el RPC captacion_summary vía service role
 *      (el RPC no es ejecutable por clientes de navegador).
 *
 * `from`/`to` (mig 262) acotan la COHORTE: conversaciones cuyo primer
 * mensaje cae en ese rango, en la fecha civil de la org. Default: los
 * últimos 90 días hasta hoy (reloj de la org, nunca new Date() en UTC).
 * Las citas, asistencias y cobros se miran hacia adelante sin tope.
 *
 * Devuelve además si la org tiene número de WhatsApp conectado, para
 * que la página distinga "sin número" de "esperando datos".
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_COHORT_DAYS = 90;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const orgIdParam = sp.get("org_id");

  // Membresía ACTIVA: con org_id explícito se valida esa; sin él, la
  // primera membresía activa del usuario (mismo criterio que /api/addons).
  let orgId = orgIdParam;
  if (orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "no_organization" }, { status: 403 });
    }
    orgId = membership.organization_id as string;
  }

  const admin = createAdminClient();

  const [{ data: grant }, { data: waConfig }, { data: orgRow }] = await Promise.all([
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
    admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle(),
  ]);

  if (!grant?.enabled) {
    return NextResponse.json({ error: "addon_not_enabled" }, { status: 403 });
  }

  // Rango de la cohorte en el reloj de la org.
  const tz = resolveOrgTimezone((orgRow as { timezone?: string | null } | null)?.timezone);
  const today = todayInTz(tz);
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  if ((fromParam && !YMD_RE.test(fromParam)) || (toParam && !YMD_RE.test(toParam))) {
    return NextResponse.json({ error: "Fechas inválidas (yyyy-MM-dd)" }, { status: 400 });
  }
  const to = toParam ?? today;
  const from =
    fromParam ?? format(subDays(zonedNow(tz), DEFAULT_COHORT_DAYS - 1), "yyyy-MM-dd");
  if (from > to) {
    return NextResponse.json(
      { error: "Rango inválido: la fecha final es anterior a la inicial" },
      { status: 400 },
    );
  }

  const { data: summary, error } = await admin.rpc("captacion_summary", {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      whatsapp_connected: Boolean(waConfig?.is_active && waConfig?.phone_number_id),
      range: { from, to, timezone: tz, today },
      summary,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
