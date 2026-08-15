import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import {
  cancelModuleAddonCharge,
  getOrgPlanContext,
} from "@/lib/billing/module-addon-billing";
import { planLabel, resolveModuleBilling } from "@/lib/billing/module-pricing";
import {
  collectModuleUsage,
  daysBetween,
  notifyFounderModuleDeactivated,
  sendModuleDeactivatedEmail,
} from "@/lib/module-lifecycle-emails";

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
 *
 * ── Guarda de caja abierta ───────────────────────────────────────
 * Desactivar 'caja' con un turno abierto se rechaza con 409: el turno
 * quedaría abierto para siempre y sin pantalla desde la cual cerrarlo.
 *
 * ── Avisos ───────────────────────────────────────────────────────
 * Tras la baja salen, best-effort, el correo de confirmación al owner
 * (nada se borra + por qué lo desactivó) y la alerta de −MRR al founder
 * con el historial de uso. Ver lib/module-lifecycle-emails.ts.
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

  const orgId = membership.organization_id;
  const admin = createAdminClient();

  // ── Guarda: caja abierta ─────────────────────────────────────────
  // Desactivar Caja con un turno abierto lo deja abierto PARA SIEMPRE y
  // sin pantalla desde la cual cerrarlo: el sidebar deja de mostrar la
  // sección y el turno sigue absorbiendo cobros en silencio, con un
  // arqueo que ya nadie va a firmar. Se rechaza antes de tocar el cobro
  // en Mercado Pago, para no dejar la suscripción bajada y el módulo
  // activo.
  if (addonKey === "caja") {
    const { data: openShift } = await admin
      .from("cash_shifts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openShift) {
      return NextResponse.json(
        {
          code: "open_shift",
          error:
            "Cierra la caja abierta antes de desactivar el módulo. Si la desactivamos ahora, ese turno queda abierto para siempre y sin pantalla desde la cual cerrarlo.",
        },
        { status: 409 }
      );
    }
  }

  // Datos que solo existen ANTES de la baja: el precio que se deja de
  // cobrar, cuánto tiempo estuvo activo y cuánto se usó. Se leen aquí
  // para que la alerta al founder sea accionable.
  const [{ data: addonRow }, { data: orgAddonRow }, planCtx, usage] = await Promise.all([
    admin
      .from("addons")
      .select("key, name, monthly_price, included_from_plan")
      .eq("key", addonKey)
      .maybeSingle(),
    admin
      .from("organization_addons")
      .select("activated_at")
      .eq("organization_id", orgId)
      .eq("addon_key", addonKey)
      .maybeSingle(),
    getOrgPlanContext(admin, orgId),
    collectModuleUsage(admin, orgId, addonKey),
  ]);

  const billing = resolveModuleBilling(addonRow, planCtx?.planSlug ?? null);
  const chargedPrice = billing.requiresPayment ? billing.price : null;

  // ── Baja del cobro (si el módulo se estaba cobrando) ─────────────
  const cancellation = await cancelModuleAddonCharge(admin, {
    orgId,
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
    .eq("organization_id", orgId)
    .eq("addon_key", addonKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Avisos de la baja (best-effort) ──────────────────────────────
  // La baja ya está hecha y el cobro ya está cancelado: ni el correo de
  // confirmación ni la alerta al founder pueden devolver un error aquí.
  // Van con await (en serverless lo pendiente muere al responder) dentro
  // de un try/catch que se traga todo.
  try {
    const newMonthlyTotal =
      cancellation.status === "cancelled" ? cancellation.newMonthlyTotal : null;

    await sendModuleDeactivatedEmail({
      admin,
      organizationId: orgId,
      addonKey,
      monthlyPrice: chargedPrice,
      newMonthlyTotal,
    });

    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    await notifyFounderModuleDeactivated({
      admin,
      organizationId: orgId,
      addonKey,
      planLabel: planLabel(planCtx?.planSlug ?? null),
      monthlyPrice: chargedPrice,
      actorLabel:
        ((profile?.full_name as string | null) || "").trim() ||
        user.email ||
        "un administrador",
      newMonthlyTotal,
      daysActive: daysBetween(orgAddonRow?.activated_at as string | null, new Date()),
      usage,
    });
  } catch (err) {
    console.warn("[addons/deactivate] avisos de baja fallaron:", err);
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
