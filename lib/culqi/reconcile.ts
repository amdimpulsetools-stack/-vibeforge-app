// Reconciliación de un link de cobro pagado (compartida entre la ruta
// pública de cobro y el webhook de Culqi).
//
// El claim `status <> 'paid'` es atómico: si el webhook y la respuesta
// HTTP del cargo llegan a la vez, solo UNO gana el update y solo ese
// inserta el patient_payment. El perdedor ve alreadyPaid=true y no
// duplica nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CulqiPaymentMethod } from "./client";

/** Fila de payment_links (mig 229 — aún no está en types/database.ts, cast local). */
export interface PaymentLinkRow {
  id: string;
  token: string;
  organization_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  amount: number;
  currency: string;
  concept: string;
  status: "pending" | "processing" | "paid" | "cancelled" | "expired";
  culqi_charge_id: string | null;
  payment_method: string | null;
  patient_payment_id: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
}

export const PAYMENT_LINK_COLUMNS =
  "id, token, organization_id, patient_id, appointment_id, amount, currency, concept, " +
  "status, culqi_charge_id, payment_method, patient_payment_id, created_by, created_at, " +
  "expires_at, paid_at";

/** Fecha local de Lima (YYYY-MM-DD) para payment_date (columna DATE). */
export function todayInLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
  }).format(new Date());
}

// Etiquetas del vocabulario existente de patient_payments.payment_method
// (lookup 'payment_method' seed migs 006/039: el staff guarda el LABEL,
// ej. "Yape", "Tarjeta"). Ambas clasifican como tender_kind='electronico'
// en caja_classify_tender (mig 213).
const PATIENT_PAYMENT_METHOD_LABEL: Record<CulqiPaymentMethod, string> = {
  yape: "Yape",
  tarjeta: "Tarjeta",
};

export interface ReconcileResult {
  /** true = otro proceso ya lo había marcado paid (no se hizo nada). */
  alreadyPaid: boolean;
  /** patient_payment creado (o null si el link no tiene patient_id). */
  patientPaymentId: string | null;
  /** Error no-fatal al registrar el patient_payment (el link SÍ quedó paid). */
  paymentInsertError: string | null;
}

/**
 * Marca el link como pagado y registra el patient_payment.
 * `admin` DEBE ser el client service role (createAdminClient): el
 * pagador no tiene sesión y el webhook viene de Culqi.
 *
 * El insert en patient_payments dispara caja_stamp_payment (migs
 * 213/214): clasifica tender_kind y ata el pago al turno de caja
 * abierto o lo deja "fuera de turno" — nunca rechaza.
 */
export async function reconcilePaidLink(
  admin: SupabaseClient,
  link: PaymentLinkRow,
  charge: { chargeId: string; method: CulqiPaymentMethod }
): Promise<ReconcileResult> {
  // 1. Claim atómico: solo un proceso pasa de no-paid a paid.
  const { data: claimed } = await admin
    .from("payment_links")
    .update({
      status: "paid",
      culqi_charge_id: charge.chargeId,
      payment_method: charge.method,
      paid_at: new Date().toISOString(),
    })
    .eq("id", link.id)
    .neq("status", "paid")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return { alreadyPaid: true, patientPaymentId: null, paymentInsertError: null };
  }

  // 2. patient_payment (solo si hay paciente vinculado). Deuda del
  // paciente y Caja se alimentan de esta fila; el resto lo hacen los
  // triggers existentes.
  if (!link.patient_id) {
    return { alreadyPaid: false, patientPaymentId: null, paymentInsertError: null };
  }

  const { data: payment, error: insertError } = await admin
    .from("patient_payments")
    .insert({
      organization_id: link.organization_id,
      patient_id: link.patient_id,
      appointment_id: link.appointment_id,
      amount: Number(link.amount),
      payment_method: PATIENT_PAYMENT_METHOD_LABEL[charge.method],
      payment_date: todayInLima(),
      notes: `Pago en línea (link de cobro): ${link.concept} — Culqi ${charge.chargeId}`,
      source: "clinical",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    // El cobro en Culqi YA pasó: no revertimos el link. Queda paid sin
    // patient_payment_id; el webhook o soporte pueden re-registrarlo.
    return {
      alreadyPaid: false,
      patientPaymentId: null,
      paymentInsertError: insertError?.message ?? "insert sin fila",
    };
  }

  const paymentId = (payment as { id: string }).id;
  await admin
    .from("payment_links")
    .update({ patient_payment_id: paymentId })
    .eq("id", link.id);

  return { alreadyPaid: false, patientPaymentId: paymentId, paymentInsertError: null };
}
