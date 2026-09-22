/**
 * Módulo TRATAMIENTOS (addon fertilidad) — tipos compartidos.
 * Espejo de las migs 242/245. Cambiar JUNTO con las migraciones.
 */

export type TreatmentStatus = "in_progress" | "completed" | "abandoned" | "cancelled";
/** `completed` (mig 268): terminó sin desenlace clínico que registrar (ciclo de donante). */
export type TreatmentOutcome =
  | "pregnancy"
  | "no_pregnancy"
  | "abandoned"
  | "transferred"
  | "completed"
  | "other";
export type RevenueBucket = "honorarium" | "general" | "third_party";

export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = {
  in_progress: "En curso",
  completed: "Completado",
  abandoned: "Abandonado",
  cancelled: "Cancelado",
};

export const TREATMENT_OUTCOME_LABELS: Record<TreatmentOutcome, string> = {
  pregnancy: "Embarazo confirmado",
  no_pregnancy: "Completado sin embarazo",
  abandoned: "Abandonado",
  transferred: "Derivado a otro centro",
  completed: "Completado",
  other: "Otro",
};

export const REVENUE_BUCKET_LABELS: Record<RevenueBucket, string> = {
  honorarium: "Honorarios médicos",
  general: "Clínica",
  third_party: "Terceros",
};

/** Motivos de abandono ofrecidos en el cierre (texto libre también permitido). */
export const ABANDON_REASON_OPTIONS = [
  "Económico",
  "Médico",
  "Personal / familiar",
  "Cambió de centro",
  "Otro",
] as const;

export interface Treatment {
  id: string;
  organization_id: string;
  patient_id: string;
  budget_record_id: string | null;
  doctor_id: string | null;
  assistant_member_id: string | null;
  service_id: string | null;
  treatment_type: string;
  title: string;
  /** Monto ACORDADO, bruto. */
  expected_total: number;
  status: TreatmentStatus;
  outcome: TreatmentOutcome | null;
  outcome_reason: string | null;
  external_receipt_ref: string | null;
  started_at: string; // yyyy-MM-dd
  started_by: string | null;
  closed_at: string | null; // yyyy-MM-dd
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPaymentConcept {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  revenue_bucket: RevenueBucket;
  igv_affectation: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

/** Fila de patient_payments proyectada para el módulo (siempre source='clinical'). */
export interface TreatmentClinicPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  notes: string | null;
  source: string | null;
  treatment_id: string | null;
  treatment_concept_id: string | null;
  revenue_bucket: RevenueBucket | null;
  external_receipt_ref: string | null;
  created_by: string | null;
  created_at: string;
  /** Turno de Caja al que lo ató el trigger (mig 214) — solo lectura. */
  cash_shift_id: string | null;
  /** Comprobante emitido desde Yenda, si lo hay (mig 108). */
  einvoice_id: string | null;
}

export interface TreatmentExternalPayment {
  id: string;
  organization_id: string;
  treatment_id: string;
  concept_id: string | null;
  amount: number;
  payee_name: string | null;
  paid_on: string; // yyyy-MM-dd
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Ítem de la lista /tratamientos (GET /api/treatments). */
export interface TreatmentListItem extends Treatment {
  patient_name: string;
  patient_phone: string | null;
  doctor_name: string | null;
  money: import("@/lib/treatments/money").TreatmentMoney;
  last_payment_at: string | null;
}

/** JSON de get_treatments_overview (mig 245). `honorarium_*` NULL para recepción. */
export interface TreatmentsOverview {
  collected_total: number;
  honorarium_collected: number | null;
  third_party_collected: number | null;
  pending_in_progress: number;
  in_progress_count: number;
  started_in_period: number;
  closed_in_period: number;
  sees_fees: boolean;
  doctor_scope_id: string | null;
}

/**
 * Aplicación de un producto del almacén al tratamiento (mig 268): una
 * salida del kardex con `treatment_id`. Es un COSTO, nunca un cobro:
 * no entra en `money` (acordado / pagado / pendiente).
 */
export interface TreatmentSupply {
  id: string;
  product_id: string;
  product_name: string;
  base_unit: string;
  lot_id: string | null;
  lot_code: string | null;
  /** Unidades aplicadas (positivo; el kardex lo guarda negativo). */
  quantity: number;
  /** CPP congelado al aplicar (sin IGV). NULL si el producto nunca tuvo entrada con costo. */
  unit_cost: number | null;
  cost_total: number | null;
  movement_date: string; // yyyy-MM-dd
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** GET /api/treatments/[id] */
export interface TreatmentDetailResponse {
  treatment: Treatment & {
    patient_name: string;
    patient_phone: string | null;
    doctor_name: string | null;
    assistant_name: string | null;
    budget_amount: number | null;
    budget_tier: string | null;
  };
  payments: TreatmentClinicPayment[];
  external_payments: TreatmentExternalPayment[];
  concepts: TreatmentPaymentConcept[];
  money: import("@/lib/treatments/money").TreatmentMoney;
  /** false para recepción: el cliente oculta honorarios. */
  sees_fees: boolean;
  can_close: boolean;
  can_reopen: boolean;
  /** Aplicaciones de almacén vivas (sin los pares deshechos), más recientes primero. */
  supplies: TreatmentSupply[];
  /** Σ cost_total de `supplies` (costo sin IGV). Ver lib/treatments/money.ts. */
  supplies_cost: number;
  /** Alguna aplicación sin costo estampado: `supplies_cost` está incompleto. */
  supplies_estimated: boolean;
  /** Tratamiento en curso + módulo Almacén activo: se puede aplicar producto. */
  can_apply_supplies: boolean;
  /** Puede deshacer aplicaciones: editor de almacén (mig 267). El autor de cada fila también (lo resuelve el RPC). */
  can_undo_supplies: boolean;
}

/** POST /api/treatments/[id]/payments */
export type TreatmentPaymentInput =
  | {
      kind: "clinic";
      amount: number;
      concept_id: string;
      payment_method: string;
      payment_date?: string;
      notes?: string;
      external_receipt_ref?: string;
    }
  | {
      kind: "external";
      amount: number;
      concept_id?: string | null;
      payee_name?: string;
      paid_on?: string;
      notes?: string;
    };

/** POST /api/treatments/[id]/close */
export interface TreatmentCloseInput {
  status: Exclude<TreatmentStatus, "in_progress">;
  outcome?: TreatmentOutcome;
  reason?: string;
  closed_at?: string;
}

/** POST /api/budgets/[id]/start (ahora crea el tratamiento vía RPC). */
export interface TreatmentStartInput {
  doctor_id?: string | null;
  assistant_member_id?: string | null;
  started_at?: string;
  notes?: string;
}

/** POST /api/treatments/[id]/supplies (mig 268: RPC treatment_apply_product). */
export interface TreatmentSupplyInput {
  product_id: string;
  quantity: number;
  lot_id?: string | null;
  movement_date?: string;
  notes?: string;
}
