import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { seedFertilityAddon } from "@/lib/fertility/seed-fertility-addon";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";
import {
  moduleAddonType,
  planLabel,
  resolveModuleBilling,
} from "@/lib/billing/module-pricing";
import {
  cancelModuleAddonCharge,
  findActiveModuleCharge,
  getOrgPlanContext,
} from "@/lib/billing/module-addon-billing";
import {
  computeSubscriptionAmount,
  updatePreApprovalAmount,
} from "@/lib/mercadopago/update-preapproval";
import { notifyOrgMembers } from "@/lib/live-notifications/notify";
import {
  getModuleCopy,
  isLifecycleModule,
  notifyFounderModuleActivated,
  sendModuleWelcomeEmail,
} from "@/lib/module-lifecycle-emails";

/**
 * POST /api/addons/[key]/activate
 *
 * Activates an addon for the current org. When the addon belongs to a
 * tier_group (fertility_basic / fertility_premium share `fertility`),
 * enforces mutual exclusion with the other active tier in the same group.
 *
 * ── Módulos de pago (mig 210) ────────────────────────────────────
 * Si el addon tiene `monthly_price` en el catálogo y el plan de la org
 * NO lo incluye (`included_from_plan`), la activación NO es directa:
 * primero se COBRA, sumando el precio al monto de la suscripción de
 * Mercado Pago. El flujo reusa exactamente la maquinaria de los cupos
 * extra (PUT /api/mercadopago/subscription, mig 152):
 *
 *   1. purchase_addon_atomic(addon_type = 'module_<key>', qty 1) →
 *      reserva bajo lock con status 'pending_mp_sync' y devuelve el
 *      total nuevo calculado DENTRO del lock.
 *   2. updatePreApprovalAmount(preapproval, nuevo total).
 *   3. Solo si MP acepta: la reserva pasa a 'active' y RECIÉN entonces
 *      se hace el upsert en organization_addons (enabled = true).
 *   4. Si MP falla: se libera la reserva y se devuelve 502 — la org no
 *      se queda ni con el módulo ni con el cobro.
 *
 * El precio SIEMPRE sale del catálogo en base; el cliente no envía
 * montos y este endpoint no lee ninguno del body.
 *
 * For fertility_basic / fertility_premium specifically it also seeds:
 *   - per-org clones of the 3 global followup_rules (with email_template_key
 *     preserved)
 *   - per-org rows in whatsapp_templates from the static resource
 *     `lib/fertility/whatsapp-templates.ts` (status='PENDING' so the org
 *     admin can submit them to Meta later)
 *   - whatsapp_template_id wired into the per-org rules
 *
 * The seed runs after the org_addons upsert. Best-effort — partial seed
 * failure does NOT roll back the activation itself, since the addon must
 * still be activatable even if the org has no WhatsApp configured. We
 * surface a soft warning in the response.
 */
export async function POST(
  req: NextRequest,
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
      { error: "Solo el dueño o un administrador pueden activar addons" },
      { status: 403 }
    );
  }

  const orgId = membership.organization_id;

  // Verify addon exists. monthly_price / included_from_plan (mig 210)
  // definen si esta activación pasa por caja.
  const { data: addon, error: addonErr } = await supabase
    .from("addons")
    .select("key, name, tier_group, is_active, monthly_price, included_from_plan")
    .eq("key", addonKey)
    .single();
  if (addonErr || !addon) {
    return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  }

  // Grant explícito de la org sobre este addon. Misma semántica que el
  // GET de /api/addons: un addon oculto (is_active=false, en beta) sigue
  // sin existir para el resto del mundo, pero la org con grant puede
  // operarlo — antes de esto una org beta veía el módulo en su listado
  // y recibía 400 al activarlo.
  const { data: orgAddonRow } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", orgId)
    .eq("addon_key", addonKey)
    .maybeSingle();

  if (addon.is_active === false && !orgAddonRow) {
    return NextResponse.json(
      { error: "Este addon no está disponible" },
      { status: 400 }
    );
  }

  // Tier group exclusivity guard.
  if (addon.tier_group) {
    const { data: peerAddons } = await supabase
      .from("addons")
      .select("key")
      .eq("tier_group", addon.tier_group)
      .neq("key", addonKey);

    const peerKeys = (peerAddons ?? []).map((a) => a.key);
    if (peerKeys.length > 0) {
      const { data: activePeers } = await supabase
        .from("organization_addons")
        .select("addon_key")
        .eq("organization_id", orgId)
        .eq("enabled", true)
        .in("addon_key", peerKeys);

      if (activePeers && activePeers.length > 0) {
        return NextResponse.json(
          {
            error:
              "Ya tienes activo otro tier de este pack. Debes desactivar el tier actual o usar el endpoint de upgrade.",
            conflicting_addon_key: activePeers[0].addon_key,
            tier_group: addon.tier_group,
          },
          { status: 409 }
        );
      }
    }
  }

  // ── ¿Este módulo pasa por caja? ──────────────────────────────────
  const planCtx = await getOrgPlanContext(supabase, orgId);
  const billing = resolveModuleBilling(addon, planCtx?.planSlug ?? null);

  let charge: {
    addon_id: string;
    unit_price: number;
    /** null cuando el cobro ya existía (re-activación sin nuevo cargo). */
    new_monthly_total: number | null;
  } | null = null;
  /** true solo si este request creó el cargo (para saber qué revertir). */
  let chargeIsNew = false;

  if (billing.requiresPayment && billing.price !== null) {
    const admin = createAdminClient();

    // Reactivación de un módulo que ya se está cobrando (el owner lo
    // desactivó desde la UI pero la baja de cobro falló, o lo apagó
    // dentro del mismo ciclo): NO se vuelve a cobrar, solo se re-habilita.
    const existingCharge = await findActiveModuleCharge(admin, orgId, addonKey);

    if (!existingCharge) {
      // Sin preapproval no hay nada que actualizar en MP: la org está en
      // trial o dejó el checkout a medias. Cobrar sería imposible y
      // activar gratis sería regalar el módulo.
      if (!planCtx || !planCtx.mpPreapprovalId) {
        return NextResponse.json(
          {
            code: "subscription_required",
            error:
              "Activa tu suscripción primero. Este módulo se cobra dentro de tu suscripción mensual y todavía no tienes un método de pago activo.",
            monthly_price: billing.price,
          },
          { status: 409 }
        );
      }

      // 1. Reserva atómica (lock sobre la suscripción + índice único
      //    parcial contra dobles clics). Mismo RPC que los cupos extra.
      const { data: reservation, error: rpcErr } = await admin.rpc(
        "purchase_addon_atomic",
        {
          p_org_id: orgId,
          p_user_id: user.id,
          p_addon_type: moduleAddonType(addonKey),
          p_quantity: 1,
          p_unit_price: billing.price,
        }
      );

      if (rpcErr) {
        const msg = rpcErr.message || "";
        if (msg.includes("addon_purchase_in_progress")) {
          return NextResponse.json(
            {
              code: "addon_purchase_in_progress",
              error:
                "Ya hay una activación de este módulo en proceso. Espera unos segundos y reintenta.",
            },
            { status: 409 }
          );
        }
        if (msg.includes("no_active_subscription") || msg.includes("subscription_required")) {
          return NextResponse.json(
            {
              code: "subscription_required",
              error:
                "Activa tu suscripción primero. Este módulo se cobra dentro de tu suscripción mensual.",
            },
            { status: 409 }
          );
        }
        console.error("[addons/activate] purchase_addon_atomic error:", msg);
        return NextResponse.json({ error: "No pudimos registrar el cobro del módulo" }, { status: 500 });
      }

      const reservationData = reservation as {
        addon_id: string;
        subscription_id: string;
        mp_preapproval_id: string;
        new_total: number;
      };

      // 2. Empujar el total nuevo a Mercado Pago. Aplica desde el
      //    siguiente ciclo (MP no prorratea el ciclo en curso).
      try {
        await updatePreApprovalAmount(
          reservationData.mp_preapproval_id,
          Number(reservationData.new_total)
        );
      } catch (error) {
        // Reversa: se borra la reserva; la org no queda ni cobrada ni
        // con el módulo activo.
        await admin.from("plan_addons").delete().eq("id", reservationData.addon_id);
        await admin.from("billing_events").insert({
          organization_id: orgId,
          subscription_id: reservationData.subscription_id,
          event_type: "module_addon_mp_sync_failed",
          metadata: {
            operation: "activate",
            addon_key: addonKey,
            addon_type: moduleAddonType(addonKey),
            unit_price: billing.price,
            attempted_total: reservationData.new_total,
            rolled_back_addon_id: reservationData.addon_id,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        console.error("[addons/activate] MP sync failed:", error);
        return NextResponse.json(
          {
            code: "mp_sync_failed",
            error:
              "No pudimos actualizar tu suscripción en Mercado Pago. No se te cobró nada; intenta de nuevo en unos minutos.",
          },
          { status: 502 }
        );
      }

      // 3. MP aceptó → confirmar la reserva ANTES de habilitar el módulo.
      const { error: confirmErr } = await admin
        .from("plan_addons")
        .update({ is_active: true, status: "active" })
        .eq("id", reservationData.addon_id);

      if (confirmErr) {
        // Caso patológico (índice único de módulo activo). Se deshace la
        // reserva y se devuelve MP a su monto real para no dejar a la org
        // pagando un módulo que no quedó registrado.
        await admin.from("plan_addons").delete().eq("id", reservationData.addon_id);
        try {
          const restored = await getOrgPlanContext(admin, orgId);
          if (restored?.mpPreapprovalId && restored.planId) {
            const realTotal = await computeSubscriptionAmount(admin, orgId, restored.planId);
            await updatePreApprovalAmount(restored.mpPreapprovalId, realTotal);
          }
        } catch (restoreErr) {
          console.error("[addons/activate] restore MP amount failed:", restoreErr);
        }
        await admin.from("billing_events").insert({
          organization_id: orgId,
          subscription_id: reservationData.subscription_id,
          event_type: "module_addon_mp_sync_failed",
          metadata: {
            operation: "confirm",
            addon_key: addonKey,
            addon_type: moduleAddonType(addonKey),
            error: confirmErr.message,
          },
        });
        return NextResponse.json(
          { error: "No pudimos confirmar la activación del módulo. Intenta de nuevo." },
          { status: 500 }
        );
      }

      charge = {
        addon_id: reservationData.addon_id,
        unit_price: billing.price,
        new_monthly_total: Number(reservationData.new_total),
      };
      chargeIsNew = true;

      await admin.from("billing_events").insert({
        organization_id: orgId,
        subscription_id: reservationData.subscription_id,
        event_type: "module_addon_added",
        metadata: {
          addon_key: addonKey,
          addon_type: moduleAddonType(addonKey),
          addon_id: reservationData.addon_id,
          unit_price: billing.price,
          added_by: user.id,
          plan_slug: planCtx.planSlug,
          new_monthly_total: reservationData.new_total,
        },
      });
    } else {
      charge = {
        addon_id: existingCharge.id,
        unit_price: existingCharge.unit_price,
        new_monthly_total: null,
      };
    }
  }

  // Upsert organization_addons enabled=true.
  const { error: upsertErr } = await supabase
    .from("organization_addons")
    .upsert(
      {
        organization_id: orgId,
        addon_key: addonKey,
        enabled: true,
        activated_by: user.id,
        activated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,addon_key" }
    );

  if (upsertErr) {
    // El cobro ya está hecho pero el módulo no quedó habilitado: se
    // revierte el cargo para no dejar a la clínica pagando algo que no
    // tiene. cancelModuleAddonCharge baja también el monto en MP.
    if (charge && chargeIsNew) {
      await cancelModuleAddonCharge(createAdminClient(), {
        orgId,
        addonKey,
        actorUserId: user.id,
      });
    }
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // ── Avisos del ciclo de vida (best-effort) ───────────────────────
  // El módulo YA está activo y cobrado: nada de lo que pase aquí abajo
  // puede tumbar la activación. Va AWAIT y no fire-and-forget porque en
  // serverless el trabajo pendiente muere cuando el handler responde
  // (misma razón que documenta lib/resend.ts); el try/catch es lo que
  // garantiza que un fallo de correo no se convierta en un 500.
  try {
    await announceActivation({
      orgId,
      addonKey,
      addonName: addon.name,
      actorId: user.id,
      actorEmail: user.email ?? null,
      planSlug: planCtx?.planSlug ?? null,
      monthlyPrice: billing.requiresPayment ? billing.price : null,
      newMonthlyTotal: charge?.new_monthly_total ?? null,
    });
  } catch (err) {
    console.warn("[addons/activate] avisos de activación fallaron:", err);
  }

  const billingPayload = {
    charged: Boolean(charge),
    monthly_price: billing.price,
    included_in_plan: billing.includedInPlan,
    new_monthly_total: charge?.new_monthly_total ?? null,
  };

  const isFertilityTier =
    addonKey === FERTILITY_BASIC_KEY || addonKey === FERTILITY_PREMIUM_KEY;

  if (!isFertilityTier) {
    return NextResponse.json(
      {
        activated: true,
        addon_key: addonKey,
        requires_setup: false,
        billing: billingPayload,
      },
      { status: 201 }
    );
  }

  // ── Fertility seed (services, rules, whatsapp + email templates) ──
  // Shared with the onboarding wizard's auto-activation path so both stay
  // in sync. Uses a service-role client; every write is scoped to orgId.
  const admin = createAdminClient();
  const warnings = await seedFertilityAddon(admin, orgId);

  return NextResponse.json(
    {
      activated: true,
      addon_key: addonKey,
      requires_setup: true,
      setup_url: "/admin/addon-config/fertility/canonical-mapping",
      warnings,
      billing: billingPayload,
    },
    { status: 201 }
  );
}

/* ═══════════════ Avisos posteriores a la activación ═══════════════ */

interface AnnounceInput {
  orgId: string;
  addonKey: string;
  addonName: string | null;
  actorId: string;
  actorEmail: string | null;
  planSlug: string | null;
  /** Precio que se cobra por el módulo, o null si va incluido en el plan. */
  monthlyPrice: number | null;
  newMonthlyTotal: number | null;
}

/**
 * Bienvenida + campanita + alerta al founder. Todo con el admin client:
 * hay que leer perfiles de OTROS miembros y escribir en ops_notice_log,
 * que es service_role.
 *
 * Cada pieza va en su propio try/catch: que no salga el correo no puede
 * impedir que salga la campanita, ni al revés.
 */
async function announceActivation(input: AnnounceInput): Promise<void> {
  if (!isLifecycleModule(input.addonKey)) return;

  const admin = createAdminClient();
  const copy = getModuleCopy(input.addonKey);
  if (!copy) return;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name")
    .eq("id", input.actorId)
    .maybeSingle();
  const actorLabel =
    ((profile?.full_name as string | null) || "").trim() ||
    input.actorEmail ||
    "un administrador";

  // 1. Bienvenida al owner y a los admins (el comprobante de la decisión).
  try {
    await sendModuleWelcomeEmail({
      admin,
      organizationId: input.orgId,
      addonKey: input.addonKey,
      activatedByName: actorLabel,
    });
  } catch (err) {
    console.warn("[addons/activate] correo de bienvenida falló:", err);
  }

  // 2. Campanita: el hecho administrativo, para la dirección.
  try {
    await notifyOrgMembers(admin, {
      organizationId: input.orgId,
      event: "module_activated",
      title: `${copy.label} activado`,
      body: input.monthlyPrice
        ? `El módulo ya está disponible en el menú. Se suma a la suscripción mensual. Les enviamos por correo los 3 primeros pasos.`
        : `El módulo ya está disponible en el menú. Les enviamos por correo los 3 primeros pasos.`,
      actionUrl: copy.path,
    });
  } catch (err) {
    console.warn("[addons/activate] campanita module_activated falló:", err);
  }

  // 3. Campanita: "tienes una sección nueva", a quien de verdad la verá.
  //    La audiencia depende del módulo, no del evento — ver el sidebar:
  //    Caja y Farmacia llevan hideForDoctor (el doctor no cobra al
  //    mostrador) y Almacén no, porque el doctor sí descuenta insumos en
  //    consulta. Al actor no se le anuncia lo que acaba de hacer.
  const announcements: {
    audiences: ("owner_admin" | "doctor" | "reception")[];
    title: string;
    body: string;
    actionUrl: string;
  }[] = [];

  if (input.addonKey === "caja") {
    announcements.push({
      audiences: ["owner_admin", "reception"],
      title: "Nueva sección: Caja",
      body: "Tu clínica activó el control de caja por turnos. Mañana, antes del primer cobro, abre la caja: toma 30 segundos y hace que todo lo que cobres quede ordenado.",
      actionUrl: "/caja",
    });
  } else if (input.addonKey === "almacen") {
    announcements.push({
      audiences: ["owner_admin", "reception"],
      title: "Nueva sección: Almacén",
      body: "Tu clínica activó el control de inventario. Empieza cargando los 20 productos que más mueves con su saldo actual — no hace falta el catálogo completo.",
      actionUrl: "/almacen",
    });
    announcements.push({
      // Copy propio para el doctor: a él no le interesa el kardex, le
      // interesa dejar de contar cajas a mano después de la consulta.
      audiences: ["doctor"],
      title: "Nueva sección: Almacén",
      body: "Tu clínica activó el control de inventario: ahora puedes descontar los insumos que usas en consulta y quedan registrados con su costo.",
      actionUrl: "/almacen",
    });
    announcements.push({
      audiences: ["owner_admin", "reception"],
      title: "Nueva sección: Farmacia",
      body: "Con Almacén también se activó Farmacia: vender en el mostrador descontando del mismo kardex, con un correlativo que se asigna al confirmar la venta.",
      actionUrl: "/farmacia",
    });
  } else if (input.addonKey === "captacion") {
    announcements.push({
      audiences: ["owner_admin", "reception"],
      title: "Nueva sección: Captación",
      body: "Tu clínica activó Captación. Primero conecta WhatsApp en Ajustes → Integraciones: sin eso el módulo no captura ningún lead.",
      actionUrl: "/captacion",
    });
  }

  for (const a of announcements) {
    try {
      await notifyOrgMembers(admin, {
        organizationId: input.orgId,
        event: "module_section_available",
        title: a.title,
        body: a.body,
        actionUrl: a.actionUrl,
        audiences: a.audiences,
        excludeUserId: input.actorId,
      });
    } catch (err) {
      console.warn("[addons/activate] campanita de sección falló:", err);
    }
  }

  // 4. Alerta al founder (+MRR).
  try {
    const previousMonthlyTotal =
      input.newMonthlyTotal !== null && input.monthlyPrice
        ? input.newMonthlyTotal - input.monthlyPrice
        : null;

    await notifyFounderModuleActivated({
      admin,
      organizationId: input.orgId,
      addonKey: input.addonKey,
      addonName: input.addonName,
      planLabel: planLabel(input.planSlug),
      monthlyPrice: input.monthlyPrice,
      actorLabel,
      previousMonthlyTotal,
      newMonthlyTotal: input.newMonthlyTotal,
    });
  } catch (err) {
    console.warn("[addons/activate] alerta al founder falló:", err);
  }
}
