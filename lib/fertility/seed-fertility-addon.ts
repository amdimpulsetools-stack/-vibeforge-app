/**
 * Shared fertility-addon seeding logic.
 *
 * When an org activates fertility_basic / fertility_premium it needs a bundle
 * of per-org rows seeded: the 6 standard TRA services + tiers, budget-PDF
 * defaults, per-org clones of the 3 global followup_rules, WhatsApp templates,
 * and the fertility email templates. This used to live inline in
 * `POST /api/addons/[key]/activate`, which meant the OTHER activation path —
 * `POST /api/onboarding/complete`, which auto-activates addons by specialty
 * via a bare `organization_addons` upsert — silently skipped ALL of it. Orgs
 * onboarded through the wizard ended up with the addon "enabled" but zero
 * followup_rules, so `maybeCreateAppointmentCompletedFollowup` always no-op'd
 * and no seguimientos were ever created.
 *
 * Extracting it here lets both paths run the exact same seed.
 *
 * Best-effort: every step pushes to `warnings` instead of throwing, so a
 * partial failure (e.g. no WhatsApp configured) never blocks the activation
 * itself. Idempotent: safe to call on re-activation — existing rows are
 * preserved, customizations (rule→template links) are not overwritten.
 *
 * Must be called with a SERVICE-ROLE (admin) client: it bypasses RLS during
 * the seed. Every write is still scoped to `orgId` — we never widen scope.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FERTILITY_WHATSAPP_TEMPLATE_SEEDS } from "@/lib/fertility/whatsapp-templates";
import { FERTILITY_BASIC_KEY, FERTILITY_TIER_GROUP } from "@/types/fertility";

const FERTILITY_EMAIL_SLUGS = [
  "fertility_first_consultation_lapse",
  "fertility_second_consultation_lapse",
  "fertility_budget_pending_acceptance",
];

export async function seedFertilityAddon(
  admin: SupabaseClient,
  orgId: string
): Promise<string[]> {
  const warnings: string[] = [];

  // 0) Seed the 6 standard TRA services + 18 tiers (A/B/C) on FIRST
  //    activation only. The RPC is idempotent but checking first avoids
  //    needless work on re-activation. Any failure is a warning — the addon
  //    is still considered activated.
  const { count: existingAddonServiceCount, error: countErr } = await admin
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("created_by_addon", FERTILITY_BASIC_KEY);

  if (countErr) {
    warnings.push(
      `No se pudo verificar servicios sembrados previos: ${countErr.message}`,
    );
  } else if ((existingAddonServiceCount ?? 0) === 0) {
    const { error: seedServicesErr } = await admin.rpc(
      "seed_fertility_services",
      { p_org_id: orgId },
    );
    if (seedServicesErr) {
      warnings.push(
        `No se pudieron sembrar servicios de fertilidad: ${seedServicesErr.message}`,
      );
    }
  }

  // Seed org_budget_pdf_settings with neutral defaults. Idempotent
  // (ON CONFLICT DO NOTHING) — re-activating won't overwrite edits.
  const { error: seedPdfErr } = await admin.rpc(
    "seed_budget_pdf_settings_default",
    { p_org_id: orgId },
  );
  if (seedPdfErr) {
    warnings.push(
      `No se pudieron sembrar ajustes del PDF de presupuestos: ${seedPdfErr.message}`,
    );
  }

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

  // 2) Seed whatsapp_templates per-org from the static resource. No unique
  //    constraint on the table — insert only if missing.
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

  // 3) Wire whatsapp_template_id into per-org rules. Pick the 'amable'
  //    template per rule_key as default; admin can change it later.
  //
  //    REACTIVATION GUARD: only update rules without a whatsapp_template_id.
  //    Otherwise re-activating after the org customized which template a rule
  //    uses would silently overwrite it back to the 'amable' default.
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
      .eq("rule_key", ruleKey)
      .is("whatsapp_template_id", null);
    if (linkErr) {
      warnings.push(
        `No se pudo vincular plantilla WA a regla "${ruleKey}": ${linkErr.message}`
      );
    }
  }

  // 4) Email templates fertility: garantizar que existan per-org (vía
  //    seed_email_templates RPC, ON CONFLICT DO NOTHING) y habilitarlas.
  const { error: seedErr } = await admin.rpc("seed_email_templates", {
    org_id: orgId,
  });
  if (seedErr) {
    warnings.push(
      `No se pudieron sembrar plantillas de email: ${seedErr.message}`
    );
  }

  const { error: enableErr } = await admin
    .from("email_templates")
    .update({ is_enabled: true })
    .eq("organization_id", orgId)
    .in("slug", FERTILITY_EMAIL_SLUGS)
    .eq("is_enabled", false);
  if (enableErr) {
    warnings.push(
      `No se pudieron habilitar plantillas de email de fertility: ${enableErr.message}`
    );
  }

  return warnings;
}
