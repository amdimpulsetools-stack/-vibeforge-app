import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { resolveModuleBilling } from "@/lib/billing/module-pricing";
import {
  cancelModuleAddonCharge,
  findActiveModuleCharge,
  getOrgPlanContext,
} from "@/lib/billing/module-addon-billing";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Resolve org ────────────────────────────────────────────────
  // BUG FIX (2026-05-14): previously this only did .limit(1).single()
  // on organization_members, picking an arbitrary row. For a user
  // with multi-org access (eg. a doctor invited to two clinics)
  // that returned the wrong org and the wrong addon state — addons
  // active in their primary clinic showed as inactive because the
  // wrong org was queried.
  //
  // Fix: accept ?org_id=… and use it after verifying the caller is
  // an active member. Falls back to the first membership if no
  // param is provided (preserves callers that haven't been updated
  // yet, eg. legacy bookmarks).
  const requestedOrgId = req.nextUrl.searchParams.get("org_id");

  let orgId: string | null = null;
  if (requestedOrgId) {
    const { data: explicit } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", requestedOrgId)
      .eq("is_active", true)
      .maybeSingle();
    if (!explicit) {
      // User asked for an org they're not a member of (or membership
      // was deactivated). Don't leak addon state; treat as 403.
      return NextResponse.json(
        { error: "not_a_member_of_org" },
        { status: 403 },
      );
    }
    orgId = explicit.organization_id;
  } else {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();
    if (!membership) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    orgId = membership.organization_id;
  }

  // Narrowing explícito: las dos ramas de arriba ya garantizan un org,
  // pero TS no lo sabe y las queries de abajo son `any` (no lo habrían
  // detectado nunca).
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const [catalogRes, orgAddonsRes, orgSpecRes, orgRes, planCtx] = await Promise.all([
    // Sin filtro is_active: los addons ocultos (beta, ej. captacion)
    // se filtran abajo — solo pasan si la org tiene grant explícito.
    supabase
      .from("addons")
      .select("*")
      .order("sort_order"),
    supabase
      .from("organization_addons")
      .select("addon_key, enabled, settings, activated_at")
      .eq("organization_id", orgId),
    supabase
      .from("organization_specialties")
      .select("specialties(slug)")
      .eq("organization_id", orgId),
    supabase
      .from("organizations")
      .select("primary_specialty_id, specialties(slug)")
      .eq("id", orgId)
      .single(),
    // Plan vigente: decide si un módulo de pago (mig 210) va incluido o
    // se cobra. Se resuelve en el server para que la card nunca tenga
    // que adivinar el precio ni la regla de inclusión.
    getOrgPlanContext(supabase, orgId),
  ]);

  const orgAddons = orgAddonsRes.data ?? [];
  const grantedKeys = new Set(orgAddons.map((oa) => oa.addon_key));
  // Los addons ocultos (is_active=false, beta como `captacion`) solo
  // existen para las orgs con grant explícito en organization_addons;
  // para el resto es como si no existieran.
  const catalog = (catalogRes.data ?? []).filter(
    (a) => a.is_active || grantedKeys.has(a.key),
  );
  const orgSpecSlugs = new Set<string>();

  for (const row of orgSpecRes.data ?? []) {
    const spec = row.specialties as unknown as { slug: string } | null;
    if (spec?.slug) orgSpecSlugs.add(spec.slug);
  }

  const primarySpec = orgRes.data?.specialties as unknown as { slug: string } | null;
  if (primarySpec?.slug) orgSpecSlugs.add(primarySpec.slug);

  const enriched = catalog.map((addon) => {
    const orgAddon = orgAddons.find((oa) => oa.addon_key === addon.key);
    const recommended =
      Array.isArray(addon.specialties) &&
      addon.specialties.some((s: string) => orgSpecSlugs.has(s));
    // Facturación de módulos (mig 210). Se devuelven campos planos para
    // no romper la forma de array que consumen ~10 pantallas vía
    // useOrgAddons; los addons sin precio salen con requires_payment
    // false y included_in_plan true, exactamente como se comportaban
    // antes de existir estas columnas.
    const billing = resolveModuleBilling(addon, planCtx?.planSlug ?? null);
    return {
      ...addon,
      enabled: orgAddon?.enabled ?? false,
      activated_at: orgAddon?.activated_at ?? null,
      settings: orgAddon?.settings ?? {},
      recommended,
      monthly_price: billing.price,
      included_from_plan: billing.includedFromPlan,
      included_in_plan: billing.includedInPlan,
      requires_payment: billing.requiresPayment,
      org_plan_slug: planCtx?.planSlug ?? null,
    };
  });

  return NextResponse.json(enriched);
}

const toggleSchema = z.object({
  addon_key: z.string().min(1),
  enabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { addon_key, enabled } = parsed.data;
  const orgId = membership.organization_id;

  // ── Guardas de facturación de módulos (mig 210) ──────────────────
  // Este toggle es el camino legacy (switch simple) y NO sabe cobrar.
  // Si el addon requiere pago en este plan, se rechaza y se manda al
  // endpoint que sí pasa por caja: de lo contrario un POST directo
  // activaría un módulo de S/99 gratis.
  const { data: addonRow } = await supabase
    .from("addons")
    .select("key, monthly_price, included_from_plan")
    .eq("key", addon_key)
    .maybeSingle();

  if (!addonRow) {
    return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  }

  const planCtx = await getOrgPlanContext(supabase, orgId);
  const billing = resolveModuleBilling(addonRow, planCtx?.planSlug ?? null);
  const admin = billing.requiresPayment ? createAdminClient() : null;

  if (enabled && billing.requiresPayment && admin) {
    // Solo se deja pasar si el cobro YA existe (re-habilitar dentro del
    // mismo ciclo). Si no, el alta tiene que ir por /activate.
    const existingCharge = await findActiveModuleCharge(admin, orgId, addon_key);
    if (!existingCharge) {
      return NextResponse.json(
        {
          code: "payment_required",
          error:
            "Este módulo tiene costo mensual. Actívalo desde Configuración › Módulos para confirmar el cambio en tu suscripción.",
          monthly_price: billing.price,
        },
        { status: 409 }
      );
    }
  }

  if (!enabled && billing.requiresPayment && admin) {
    // Apagar el switch tiene que bajar el cobro, o la clínica sigue
    // pagando un módulo que ya no usa (la fuga que /api/addons/cancel
    // arregló para los cupos extra).
    const cancellation = await cancelModuleAddonCharge(admin, {
      orgId,
      addonKey: addon_key,
      actorUserId: user.id,
    });
    if (cancellation.status === "mp_failed") {
      return NextResponse.json(
        {
          code: "mp_sync_failed",
          error:
            "No pudimos actualizar tu suscripción en Mercado Pago, así que dejamos el módulo activo. Intenta de nuevo en unos minutos.",
        },
        { status: 502 }
      );
    }
  }

  if (enabled) {
    const { error } = await supabase.from("organization_addons").upsert(
      {
        organization_id: orgId,
        addon_key,
        enabled: true,
        activated_by: user.id,
        activated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,addon_key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("organization_addons")
      .update({ enabled: false })
      .eq("organization_id", orgId)
      .eq("addon_key", addon_key);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
