import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { seedFertilityAddon } from "@/lib/fertility/seed-fertility-addon";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

/**
 * POST /api/addons/[key]/activate
 *
 * Activates an addon for the current org. When the addon belongs to a
 * tier_group (fertility_basic / fertility_premium share `fertility`),
 * enforces mutual exclusion with the other active tier in the same group.
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

  // Verify addon exists.
  const { data: addon, error: addonErr } = await supabase
    .from("addons")
    .select("key, tier_group, is_active")
    .eq("key", addonKey)
    .single();
  if (addonErr || !addon) {
    return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  }
  if (addon.is_active === false) {
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
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const isFertilityTier =
    addonKey === FERTILITY_BASIC_KEY || addonKey === FERTILITY_PREMIUM_KEY;

  if (!isFertilityTier) {
    return NextResponse.json(
      {
        activated: true,
        addon_key: addonKey,
        requires_setup: false,
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
    },
    { status: 201 }
  );
}
