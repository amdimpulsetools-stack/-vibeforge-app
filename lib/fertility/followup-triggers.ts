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
  doctor_id: string | null;
  /**
   * Optional. When the followup is created from a budget_records row
   * (fertility budgets module) rather than a treatment plan, the
   * caller passes the budget id so it can be linked back. Stored as
   * the contact_events first event for traceability.
   */
  budget_record_id?: string;
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
    const { organization_id, patient_id, doctor_id, budget_record_id } = args;

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

    const insertPayload: Record<string, unknown> = {
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
    };

    if (budget_record_id) {
      insertPayload.contact_events = [
        {
          type: "budget_record_created",
          at: new Date().toISOString(),
          delivery_status: "unknown",
          budget_record_id,
        },
      ];
    }

    const { data: inserted, error } = await supabase
      .from("clinical_followups")
      .insert(insertPayload)
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
  doctor_id: string | null;
  service_id: string;
  /** ISO string of when the appointment was completed. Defaults to NOW(). */
  completed_at?: string;
  /**
   * Core followups (Fase 1). Id de la cita completada — se guarda en el
   * seguimiento core y es la clave del guard de duplicados.
   */
  appointment_id?: string;
  /**
   * Core followups (Fase 1) — última palabra del doctor al completar la
   * cita:
   *   - `undefined` → usar el default del servicio (`followup_after_days`).
   *   - `number`    → override explícito del doctor.
   *   - `null`      → el doctor desmarcó "Requiere control" → NO crear.
   */
  followup_days?: number | null;
  /** Motivo opcional escrito por el doctor. */
  followup_reason?: string;
}

/** Regla sintética de plataforma (no vive en `followup_rules`). */
export const CORE_SERVICE_FOLLOWUP_RULE_KEY = "core.service_followup";

/** Categoría canónica centinela sembrada en mig 182. */
export const CORE_NEXT_VISIT_CATEGORY = "core.next_visit";

/** Estados en los que un seguimiento cuenta como "abierto". */
const OPEN_STATUSES = ["pendiente", "contactado", "pospuesto"];

/**
 * Triggered when an appointment is marked completed.
 *
 * Dos rutas, en este orden:
 *
 *  1. **Ruta del addon** (intacta desde mig 128/130): si la org tiene el
 *     Pack Fertilidad y el servicio de la cita está mapeado a una
 *     categoría canónica que dispara reglas activas, crea un seguimiento
 *     por regla. Sin cambios de comportamiento.
 *
 *  2. **Ruta core** (Fase 1): si la ruta 1 NO creó nada, y el servicio
 *     tiene `followup_after_days` (o el doctor pidió un control
 *     explícito), crea un seguimiento genérico con target
 *     `core.next_visit`, que el trigger de atribución centinela (mig 183)
 *     cierra cuando el paciente vuelve a agendar cualquier cosa.
 *
 * La ruta core corre también para orgs CON addon, pero solo como
 * fallback: si alguna regla del addon disparó, el core se salta. Esa
 * condición ("sin regla disparada") es lo que garantiza que Vitra y la
 * Dra. Patricia no reciban seguimientos duplicados sobre las mismas
 * citas mapeadas, y a la vez da cobertura a sus servicios sin mapear.
 */
export async function maybeCreateAppointmentCompletedFollowup(
  supabase: SupabaseClient,
  args: AppointmentCompletedArgs
): Promise<{ created: number; rule_keys: string[] }> {
  const created: string[] = [];

  try {
    const enabled = await isFertilityAddonEnabled(supabase, args.organization_id);

    if (enabled) {
      // Find canonical category(ies) for the service.
      const { data: mappings } = await supabase
        .from("organization_service_canonical_mapping")
        .select("category_key")
        .eq("organization_id", args.organization_id)
        .eq("service_id", args.service_id);

      const categoryKeys = (mappings ?? []).map((m) => m.category_key);

      if (categoryKeys.length > 0) {
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
      }
    }

    // Ruta core — solo si el addon no disparó ninguna regla para esta cita.
    if (created.length === 0) {
      const coreCreated = await createCoreServiceFollowup(supabase, args);
      if (coreCreated) created.push(CORE_SERVICE_FOLLOWUP_RULE_KEY);
    }

    return { created: created.length, rule_keys: created };
  } catch {
    return { created: 0, rule_keys: [] };
  }
}

/**
 * Ruta core: seguimiento genérico "control a los N días".
 *
 * Los días salen del control del doctor si vino en el request, o del
 * default del servicio (`services.followup_after_days`, mig 182). Sin
 * ninguno de los dos, no pasa nada — que es el comportamiento actual
 * exacto de toda org que no configure nada.
 *
 * Devuelve `true` solo si insertó.
 */
async function createCoreServiceFollowup(
  supabase: SupabaseClient,
  args: AppointmentCompletedArgs
): Promise<boolean> {
  // El doctor desmarcó "Requiere control" → decisión explícita, gana
  // sobre el default del servicio.
  if (args.followup_days === null) return false;

  // El servicio se lee siempre: aunque los días vengan del doctor,
  // necesitamos el nombre para el motivo por defecto.
  const { data: service } = await supabase
    .from("services")
    .select("name, followup_after_days")
    .eq("id", args.service_id)
    .maybeSingle();

  // `followup_after_days` no está en types/database.ts todavía (no se
  // puede regenerar sin la migración aplicada) — cast local, mismo
  // patrón que usa el repo para los campos de mig 181.
  const serviceRow = service as {
    name?: string | null;
    followup_after_days?: number | null;
  } | null;

  const days =
    args.followup_days ?? serviceRow?.followup_after_days ?? null;
  if (days === null || !Number.isInteger(days) || days <= 0 || days > 365) {
    return false;
  }

  // Guard de duplicados: una cita completada genera como mucho un
  // seguimiento core abierto. Protege del doble-POST del disparo
  // fire-and-forget y de re-marcar la cita como completada.
  if (args.appointment_id) {
    const { data: existing } = await supabase
      .from("clinical_followups")
      .select("id")
      .eq("organization_id", args.organization_id)
      .eq("patient_id", args.patient_id)
      .eq("appointment_id", args.appointment_id)
      .eq("rule_key", CORE_SERVICE_FOLLOWUP_RULE_KEY)
      .in("status", OPEN_STATUSES)
      .limit(1);
    if (existing && existing.length > 0) return false;
  }

  const completedAt = args.completed_at
    ? new Date(args.completed_at)
    : new Date();
  const expectedBy = new Date(
    completedAt.getTime() + days * 24 * 3600 * 1000
  );

  const reason =
    args.followup_reason?.trim() ||
    (serviceRow?.name
      ? `Control sugerido a los ${days} días de ${serviceRow.name}`
      : `Control sugerido a los ${days} días de la última cita`);

  const { error } = await supabase.from("clinical_followups").insert({
    organization_id: args.organization_id,
    patient_id: args.patient_id,
    doctor_id: args.doctor_id,
    appointment_id: args.appointment_id ?? null,
    priority: "yellow",
    reason,
    source: "rule",
    rule_key: CORE_SERVICE_FOLLOWUP_RULE_KEY,
    target_category_canonical: CORE_NEXT_VISIT_CATEGORY,
    expected_by: expectedBy.toISOString(),
    follow_up_date: expectedBy.toISOString().slice(0, 10),
    status: "pendiente",
  });

  return !error;
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
    case "fertility.treatment_started":
      // mig 142 — Phase 5 prep: target of
      // `fertility.budget_accepted_pending_start`.
      return "Verificar inicio de tratamiento";
    default:
      return "Recordar próxima etapa del journey de fertilidad";
  }
}

