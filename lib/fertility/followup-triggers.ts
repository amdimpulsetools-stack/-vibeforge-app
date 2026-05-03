/**
 * Server-side helpers that create rule-based clinical_followups when
 * domain events fire (treatment plan created, appointment completed).
 *
 * These are best-effort: if the org has no fertility addon enabled, or
 * the rule is disabled, or the canonical mapping is missing, we silently
 * no-op. The caller's primary action (creating the plan, marking the
 * appointment completed) must NEVER fail because of these triggers.
 *
 * Usage:
 *   await maybeCreateBudgetPendingFollowup(supabase, { ... });
 *   await maybeCreateAppointmentCompletedFollowup(supabase, { ... });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

interface BudgetPendingArgs {
  organization_id: string;
  patient_id: string;
  doctor_id: string;
}

/**
 * Triggered when a treatment plan is created (acceptance pending).
 * Creates a `fertility.budget_pending_acceptance` followup whose target
 * category is `fertility.treatment_initiated`. Honors the rule's delay_days.
 */
export async function maybeCreateBudgetPendingFollowup(
  supabase: SupabaseClient,
  args: BudgetPendingArgs
): Promise<{ created: boolean; followup_id?: string; reason?: string }> {
  try {
    const { organization_id, patient_id, doctor_id } = args;

    // 1. Check addon enabled.
    const enabled = await isFertilityAddonEnabled(supabase, organization_id);
    if (!enabled) return { created: false, reason: "addon_disabled" };

    // 2. Load rule.
    const { data: rule } = await supabase
      .from("followup_rules")
      .select("rule_key, target_category_key, delay_days, max_attempts, is_active")
      .eq("organization_id", organization_id)
      .eq("rule_key", "fertility.budget_pending_acceptance")
      .maybeSingle();

    if (!rule || !rule.is_active) return { created: false, reason: "rule_inactive" };

    const expectedBy = new Date(
      Date.now() + (rule.delay_days ?? 7) * 24 * 3600 * 1000
    ).toISOString();

    const { data: inserted, error } = await supabase
      .from("clinical_followups")
      .insert({
        organization_id,
        patient_id,
        doctor_id,
        priority: "yellow",
        reason: "Recordar aceptación de presupuesto",
        source: "rule",
        rule_key: rule.rule_key,
        target_category_canonical: rule.target_category_key,
        expected_by: expectedBy,
        status: "pendiente",
        max_attempts: rule.max_attempts ?? 3,
      })
      .select("id")
      .single();

    if (error) return { created: false, reason: error.message };
    return { created: true, followup_id: inserted.id };
  } catch (err) {
    return {
      created: false,
      reason: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

interface AppointmentCompletedArgs {
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  service_id: string;
  /** ISO string of when the appointment was completed. Defaults to NOW(). */
  completed_at?: string;
}

/**
 * Triggered when an appointment is marked completed. If the service maps
 * to a canonical category that is the trigger of an active rule, creates
 * a corresponding clinical_followups row.
 */
export async function maybeCreateAppointmentCompletedFollowup(
  supabase: SupabaseClient,
  args: AppointmentCompletedArgs
): Promise<{ created: number; rule_keys: string[] }> {
  const created: string[] = [];

  try {
    const enabled = await isFertilityAddonEnabled(supabase, args.organization_id);
    if (!enabled) return { created: 0, rule_keys: [] };

    // Find canonical category(ies) for the service.
    const { data: mappings } = await supabase
      .from("organization_service_canonical_mapping")
      .select("category_key")
      .eq("organization_id", args.organization_id)
      .eq("service_id", args.service_id);

    const categoryKeys = (mappings ?? []).map((m) => m.category_key);
    if (categoryKeys.length === 0) return { created: 0, rule_keys: [] };

    // Find active rules whose trigger_category_key matches and trigger_event=appointment_completed.
    const { data: rules } = await supabase
      .from("followup_rules")
      .select("rule_key, target_category_key, delay_days, max_attempts, is_active")
      .eq("organization_id", args.organization_id)
      .eq("trigger_event", "appointment_completed")
      .in("trigger_category_key", categoryKeys);

    const completedAt = args.completed_at
      ? new Date(args.completed_at)
      : new Date();

    for (const r of rules ?? []) {
      if (!r.is_active) continue;
      const expectedBy = new Date(
        completedAt.getTime() + (r.delay_days ?? 14) * 24 * 3600 * 1000
      ).toISOString();

      const reason = buildReasonForTarget(r.target_category_key);

      const { data: inserted, error } = await supabase
        .from("clinical_followups")
        .insert({
          organization_id: args.organization_id,
          patient_id: args.patient_id,
          doctor_id: args.doctor_id,
          priority: "yellow",
          reason,
          source: "rule",
          rule_key: r.rule_key,
          target_category_canonical: r.target_category_key,
          expected_by: expectedBy,
          status: "pendiente",
          max_attempts: r.max_attempts ?? 3,
        })
        .select("id")
        .single();

      if (!error && inserted) created.push(r.rule_key);
    }

    return { created: created.length, rule_keys: created };
  } catch {
    return { created: 0, rule_keys: [] };
  }
}

async function isFertilityAddonEnabled(
  supabase: SupabaseClient,
  organization_id: string
): Promise<boolean> {
  const { data } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  return !!(data && data.length > 0);
}

function buildReasonForTarget(targetCategoryKey: string | null): string {
  switch (targetCategoryKey) {
    case "fertility.second_consultation":
      return "Recordar segunda consulta de fertilidad";
    case "fertility.treatment_decision":
      return "Recordar cita de decisión de tratamiento";
    case "fertility.treatment_initiated":
      return "Recordar inicio de tratamiento";
    default:
      return "Recordar próxima etapa del journey de fertilidad";
  }
}

