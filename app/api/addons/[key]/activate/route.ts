import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { FERTILITY_WHATSAPP_TEMPLATE_SEEDS } from "@/lib/fertility/whatsapp-templates";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  FERTILITY_TIER_GROUP,
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

  // ── Fertility seed (rules + whatsapp templates) ──────────────
  // Use admin client to seed cleanly. We still scope every write to
  // this orgId — admin client bypasses RLS but we never widen scope.
  const admin = createAdminClient();

  const warnings: string[] = [];

  // 1) Clone the 3 global rules (organization_id IS NULL, addon_key='fertility').
  const { data: globalRules, error: globalRulesErr } = await admin
    .from("followup_rules")
    .select(
      "rule_key, trigger_event, trigger_category_key, target_category_key, delay_days, max_attempts, email_template_key"
    )
    .is("organization_id", null)
    .eq("addon_key", FERTILITY_TIER_GROUP);

  if (globalRulesErr) {
    warnings.push("No se pudieron leer las reglas globales de fertility");
  }

  const rulesToInsert = (globalRules ?? []).map((r) => ({
    organization_id: orgId,
    addon_key: FERTILITY_TIER_GROUP,
    rule_key: r.rule_key,
    trigger_event: r.trigger_event,
    trigger_category_key: r.trigger_category_key,
    target_category_key: r.target_category_key,
    delay_days: r.delay_days,
    is_active: true,
    is_system: true,
    max_attempts: r.max_attempts,
    email_template_key: r.email_template_key,
  }));

  if (rulesToInsert.length > 0) {
    // Upsert by (organization_id, rule_key) — idempotent on re-activation.
    const { error: rulesErr } = await admin
      .from("followup_rules")
      .upsert(rulesToInsert, { onConflict: "organization_id,rule_key" });
    if (rulesErr) {
      warnings.push(`Error al clonar reglas: ${rulesErr.message}`);
    }
  }

  // 2) Seed whatsapp_templates per-org from the static resource.
  // whatsapp_templates has UNIQUE(organization_id, meta_template_name)?
  // The schema does NOT define a unique constraint; we insert only if
  // missing.
  const { data: existingTemplates } = await admin
    .from("whatsapp_templates")
    .select("id, meta_template_name")
    .eq("organization_id", orgId)
    .in(
      "meta_template_name",
      FERTILITY_WHATSAPP_TEMPLATE_SEEDS.map((t) => t.meta_template_name)
    );

  const existingByName = new Map<string, string>(
    (existingTemplates ?? []).map((t) => [t.meta_template_name, t.id])
  );

  const insertedTemplateIdByMetaName = new Map<string, string>();

  for (const seed of FERTILITY_WHATSAPP_TEMPLATE_SEEDS) {
    if (existingByName.has(seed.meta_template_name)) {
      insertedTemplateIdByMetaName.set(
        seed.meta_template_name,
        existingByName.get(seed.meta_template_name)!
      );
      continue;
    }

    const { data: inserted, error: insErr } = await admin
      .from("whatsapp_templates")
      .insert({
        organization_id: orgId,
        meta_template_name: seed.meta_template_name,
        category: seed.category,
        language: seed.language,
        status: "PENDING",
        header_type: "NONE",
        body_text: seed.body_text,
        variable_mapping: seed.variable_mapping,
        sample_values: seed.sample_values,
      })
      .select("id, meta_template_name")
      .single();

    if (insErr || !inserted) {
      warnings.push(
        `No se pudo sembrar plantilla WA "${seed.meta_template_name}": ${insErr?.message ?? "error desconocido"}`
      );
      continue;
    }
    insertedTemplateIdByMetaName.set(inserted.meta_template_name, inserted.id);
  }

  // 3) Wire whatsapp_template_id into per-org rules. We pick the
  //    'amable' template per rule_key as the default; admin can change
  //    it later via the rule editor.
  const defaultTemplateByRule = new Map<string, string>();
  for (const seed of FERTILITY_WHATSAPP_TEMPLATE_SEEDS) {
    if (seed.tone !== "amable") continue;
    const templateId = insertedTemplateIdByMetaName.get(seed.meta_template_name);
    if (templateId) defaultTemplateByRule.set(seed.rule_key, templateId);
  }

  for (const [ruleKey, templateId] of defaultTemplateByRule) {
    const { error: linkErr } = await admin
      .from("followup_rules")
      .update({ whatsapp_template_id: templateId })
      .eq("organization_id", orgId)
      .eq("rule_key", ruleKey);
    if (linkErr) {
      warnings.push(
        `No se pudo vincular plantilla WA a regla "${ruleKey}": ${linkErr.message}`
      );
    }
  }

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
