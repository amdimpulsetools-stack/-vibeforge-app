/**
 * Tipos del módulo GENÉRICO de seguimientos (`clinical_followups`).
 *
 * Vivían en `types/fertility.ts` por historia: el módulo nació con el
 * Pack Fertilidad. Desde la mig 182 la bandeja es core — la usan orgs
 * sin ningún addon — así que los tipos que describen la tabla y su
 * bitácora de contactos viven aquí y `types/fertility.ts` los re-exporta
 * para no romper imports existentes.
 *
 * Lo que se queda en `types/fertility.ts`: presupuestos, tiers,
 * categorías canónicas y plantillas del addon.
 */

export type FollowupStatus =
  | "pendiente"
  | "contactado"
  | "agendado_via_contacto"
  | "agendado_organico_dentro_ventana"
  | "pospuesto"
  | "desistido_silencioso"
  | "vencido"
  | "cerrado_manual";

export type FollowupSource = "manual" | "rule" | "system";

/**
 * mig 184 — origen polimórfico del seguimiento
 * (`clinical_followups.source_type` / `source_id`).
 *
 * Ortogonal a `FollowupSource`: aquel dice QUIÉN lo creó (persona,
 * regla, plataforma); éste dice DE QUÉ ENTIDAD nació. Un mismo
 * `source='rule'` puede venir de una cita o de un plan de tratamiento.
 *
 * `source_id` no tiene FK a propósito (la tabla destino depende del
 * tipo). NULL cuando el tipo es 'manual' o cuando no se pudo determinar.
 */
export type FollowupSourceType =
  | "appointment"
  | "clinical_note"
  | "treatment_plan"
  | "treatment_session"
  | "budget_record"
  | "manual";

export type FollowupClosureReason =
  | "agendado_via_contacto"
  | "agendado_organico_dentro_ventana"
  | "desistido_silencioso"
  | "vencido"
  | "cerrado_manual";

export type ContactEventType =
  | "auto_email"
  | "auto_whatsapp"
  | "manual_contacted"
  | "manual_whatsapp"
  | "manual_close"
  | "budget_record_created"
  // mig 142 — Phase 5 prep, treatment lifecycle.
  | "rule_transition"
  | "treatment_started"
  | "budget_accepted_pending_start_alert"
  // Reactivación de un seguimiento cerrado: archiva el first_contact_at
  // del ciclo anterior antes de ponerlo en NULL.
  | "reactivation_reset";

export type ContactDeliveryStatus =
  | "sent"
  | "failed"
  | "skipped_no_email"
  | "skipped_no_phone"
  | "skipped_no_whatsapp_config"
  | "skipped_template_not_approved"
  | "skipped_template_missing"
  | "skipped_template_disabled"
  | "unknown";

export interface ContactEvent {
  type: ContactEventType;
  at: string;
  by_user_id?: string | null;
  delivery_status: ContactDeliveryStatus;
  reason?: string;
  channel?: "email" | "whatsapp";
  error?: string;
  budget_record_id?: string;
  /** mig 142 — only populated for `type='rule_transition'` events. */
  from_rule?: string;
  /** mig 142 — only populated for `type='rule_transition'` events. */
  to_rule?: string;
  /**
   * Only populated for `type='reactivation_reset'` events: el
   * `first_contact_at` del ciclo anterior, archivado aquí como historial
   * auditable justo antes de que el reactivate lo ponga en NULL.
   */
  archived_first_contact_at?: string;
}

export interface FollowupRuleRow {
  id: string;
  organization_id: string | null;
  addon_key: string;
  rule_key: string;
  // mig 186 — vocabulario ampliado. Los tres primeros son de mig 127;
  // los tres últimos se añaden en Fase 2a. `budget_accepted` es el que
  // corrige el abuso documentado de mig 142
  // (`fertility.budget_accepted_pending_start` llevaba
  // 'treatment_plan_created' por falta de un valor honesto).
  trigger_event:
    | "appointment_completed"
    | "treatment_plan_created"
    | "plan_status_changed"
    | "appointment_no_show"
    | "treatment_session_missed"
    | "budget_accepted";
  trigger_category_key: string | null;
  target_category_key: string | null;
  delay_days: number;
  is_active: boolean;
  is_system: boolean;
  max_attempts: number;
  whatsapp_template_id: string | null;
  email_template_key: string | null;
  created_at: string;
}

/**
 * Ajustes de seguimientos por organización (mig 185, tabla
 * `organization_followup_settings`).
 *
 * OJO con la semántica de ausencia: NO hay backfill a propósito, así que
 * una org sin fila tiene TODO apagado (los triggers leen con
 * `COALESCE(flag, false)`). Los defaults de las columnas describen cómo
 * nace una org nueva, no el estado de las existentes.
 *
 * Solo se modelan aquí los campos que HOY consume algo. `close_on_any_
 * appointment` y `default_followup_days` existen en la tabla pero son
 * inertes (ver COMMENTs de la mig 185) y por eso no tienen ni tipo ni UI.
 */
export interface OrganizationFollowupSettings {
  missed_session_followup: boolean;
  missed_session_delay_days: number;
}

/** Estados en los que un seguimiento sigue "abierto" (pendiente de cierre). */
export const OPEN_FOLLOWUP_STATUSES: FollowupStatus[] = [
  "pendiente",
  "contactado",
  "pospuesto",
];
