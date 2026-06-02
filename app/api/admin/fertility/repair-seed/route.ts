import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { seedFertilityAddon } from "@/lib/fertility/seed-fertility-addon";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";

export const runtime = "nodejs";

/**
 * POST /api/admin/fertility/repair-seed
 *
 * Self-serve repair for orgs that have the fertility addon enabled but are
 * missing the per-org seed (most importantly the followup_rules, without
 * which no seguimientos are ever created). This is the safety net for the
 * historical bug where onboarding auto-activated the addon without seeding.
 *
 * Re-runs the SAME idempotent seed the activation endpoint runs, so it's
 * safe to call repeatedly — existing rows/customizations are preserved.
 *
 * Auth: owner/admin of an org with fertility_basic|fertility_premium enabled.
 */
export async function POST() {
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
      { error: "Solo el dueño o un administrador pueden reparar la configuración" },
      { status: 403 }
    );
  }

  const orgId = membership.organization_id;

  // Guard: only orgs with the fertility addon enabled may repair its seed.
  const { data: addon } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", orgId)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1)
    .maybeSingle();

  if (!addon) {
    return NextResponse.json(
      { error: "El addon de Fertilidad no está activo en tu organización" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const warnings = await seedFertilityAddon(admin, orgId);

  // Report the resulting rule count so the client can confirm the repair.
  const { count } = await admin
    .from("followup_rules")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_active", true);

  return NextResponse.json({ repaired: true, rules_count: count ?? 0, warnings });
}
