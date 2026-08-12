import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { cancelModuleAddonCharge } from "@/lib/billing/module-addon-billing";

/**
 * POST /api/addons/[key]/deactivate
 *
 * Marks the addon as disabled for the org. Per spec, this:
 *   - Sets organization_addons.enabled = false (gates UI via useOrgAddons).
 *   - Does NOT delete per-org followup_rules, canonical mappings nor
 *     whatsapp_templates. The data stays so re-activation is seamless and
 *     the org keeps history.
 *
 * ── Módulos de pago (mig 210) ────────────────────────────────────
 * Si el módulo se estaba cobrando (fila plan_addons con addon_type
 * 'module_<key>'), la baja del cobro va PRIMERO: se cancela la fila y se
 * empuja el monto menor a Mercado Pago. Si MP falla no se desactiva
 * nada y se devuelve 502 — preferimos que la org siga con el módulo que
 * dejarla pagando algo que ya no tiene.
 *
 * Sin prorrateo: el monto menor aplica desde el SIGUIENTE ciclo de MP;
 * lo ya pagado del ciclo en curso no se devuelve (mismo comportamiento
 * que los cupos extra en /api/addons/cancel).
 *
 * Re-activación va por POST /api/addons/[key]/activate, que vuelve a
 * cobrar si corresponde.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: addonKey } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador pueden desactivar addons" },
      { status: 403 }
    );
  }

  // ── Baja del cobro (si el módulo se estaba cobrando) ─────────────
  const admin = createAdminClient();
  const cancellation = await cancelModuleAddonCharge(admin, {
    orgId: membership.organization_id,
    addonKey,
    actorUserId: user.id,
  });

  if (cancellation.status === "mp_failed") {
    console.error(
      `[addons/deactivate] cancelación de cobro fallida (${addonKey}):`,
      cancellation.error
    );
    return NextResponse.json(
      {
        code: "mp_sync_failed",
        error:
          "No pudimos actualizar tu suscripción en Mercado Pago, así que dejamos el módulo activo. Intenta de nuevo en unos minutos.",
      },
      { status: 502 }
    );
  }

  const { error } = await supabase
    .from("organization_addons")
    .update({ enabled: false })
    .eq("organization_id", membership.organization_id)
    .eq("addon_key", addonKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    deactivated: true,
    addon_key: addonKey,
    billing:
      cancellation.status === "cancelled"
        ? {
            charge_cancelled: true,
            new_monthly_total: cancellation.newMonthlyTotal,
          }
        : { charge_cancelled: false, new_monthly_total: null },
  });
}
