import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetTreatmentType,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/assign
//
// Phase 3 of the budget tiers feature. The doctor/asesora picks a
// service + tier (A/B/C) for a patient and we snapshot the amount
// from `service_budget_tiers` into a new `budget_records` row.
//
// The `sent_at`/`sent_by_user_id` columns stay NULL — they are filled
// in later when the obstetra clicks "Enviar al paciente" (see the
// `[id]/send` route).
//
// Phase 4 (mig 167) — three new fields are now persisted so the PDF
// renders the right people:
//   • doctor_id              — required. Doctor who actually saw the
//                              patient. From the cita's doctor in
//                              flow A, manually picked in flow B.
//   • asesora_id             — required. Obstetra/asesora coordinating
//                              the budget (organization_members.id
//                              flagged is_fertility_advisor=true).
//   • appointment_id         — optional. Only set when the budget is
//                              created from the cita sidebar.
// ──────────────────────────────────────────────────────────────────

const tierEnum = z.enum(["A", "B", "C"]);

const bodySchema = z.object({
  patient_id: z.string().uuid(),
  service_id: z.string().uuid(),
  tier: tierEnum,
  doctor_id: z.string().uuid(),
  asesora_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  followup_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
  // Set to true by the UI after the user explicitly confirms they
  // want to create a budget despite the patient already having one
  // or more in an active state (pending_acceptance / accepted). The
  // check below returns 409 when this is false/missing and active
  // budgets exist — protects against the "doctor in 2nd appointment
  // doesn't know about the 1st budget" failure mode.
  acknowledged_existing: z.boolean().optional(),
});

// ──────────────────────────────────────────────────────────────────
// treatment_type inference
//
// `services.name` → BudgetTreatmentType. The 7 enum values
// (FIV/IIU/INDUCCION/CRIO/OVODONACION/ROPA/OTRO) come from mig 136.
// TED ("Transferencia Embrionaria Diferida") falls into "OTRO" because
// the enum doesn't have a dedicated TED value yet — that's intentional.
// First match wins; "OTRO" is the catch-all.
// ──────────────────────────────────────────────────────────────────
function inferTreatmentType(serviceName: string): BudgetTreatmentType {
  const upper = serviceName.toUpperCase();
  if (upper.startsWith("FIV") || upper.includes("(FIV)")) return "FIV";
  if (upper.includes("IIU") || upper.includes("INSEMINACI")) return "IIU";
  if (upper.includes("ROPA")) return "ROPA";
  if (upper.includes("CRIO")) return "CRIO";
  if (upper.includes("OVODON")) return "OVODONACION";
  if (upper.includes("INDUCCI")) return "INDUCCION";
  // TED (Transferencia Embrionaria Diferida) and any other → OTRO.
  return "OTRO";
}

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_fertility_advisor")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  // Receptionists cannot assign budgets. Owners/admins/doctors can,
  // and so can fertility advisors regardless of their base role.
  const role = membership.role;
  const isAdvisor = Boolean(membership.is_fertility_advisor);
  const allowed =
    role === "owner" || role === "admin" || role === "doctor" || isAdvisor;
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para asignar presupuestos" },
      { status: 403 },
    );
  }

  // Addon gate.
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const payload = parsed.data;

  // Defense in depth: confirm the patient belongs to caller's org.
  const { data: patient } = await supabase
    .from("patients")
    .select("id, organization_id")
    .eq("id", payload.patient_id)
    .single();
  if (!patient || patient.organization_id !== membership.organization_id) {
    return NextResponse.json(
      { error: "Paciente no encontrado en tu organización" },
      { status: 404 },
    );
  }

  // Resolve the service + ensure it's in caller's org.
  const { data: service } = await supabase
    .from("services")
    .select("id, name, organization_id, is_active, is_budget_eligible")
    .eq("id", payload.service_id)
    .single();
  if (!service || service.organization_id !== membership.organization_id) {
    return NextResponse.json(
      { error: "Servicio no encontrado en tu organización" },
      { status: 404 },
    );
  }
  if (!service.is_active || !service.is_budget_eligible) {
    return NextResponse.json(
      { error: "Servicio no elegible para presupuestos" },
      { status: 422 },
    );
  }

  // Resolve the tier (snapshot amount + currency).
  const { data: tierRow } = await supabase
    .from("service_budget_tiers")
    .select("id, amount, currency, is_active")
    .eq("service_id", payload.service_id)
    .eq("tier", payload.tier)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!tierRow) {
    return NextResponse.json(
      { error: "Tier no configurado para este servicio" },
      { status: 422 },
    );
  }

  // Validate the doctor belongs to the caller's org. `assigned_doctor_id`
  // is required at the API level — a budget without a treating doctor
  // doesn't make medical sense and the PDF needs the name to fill the
  // "Médico tratante" cell.
  const { data: doctorRow } = await supabase
    .from("doctors")
    .select("id, organization_id, is_active")
    .eq("id", payload.doctor_id)
    .maybeSingle();
  if (
    !doctorRow ||
    doctorRow.organization_id !== membership.organization_id ||
    !doctorRow.is_active
  ) {
    return NextResponse.json(
      { error: "Doctor inválido para esta organización" },
      { status: 422 },
    );
  }

  // Validate the asesora is a member of the org AND flagged as
  // fertility advisor. The select dropdown in the modal pre-filters to
  // these members, so this is a defense-in-depth check.
  const { data: advisorRow } = await supabase
    .from("organization_members")
    .select("id, organization_id, is_fertility_advisor, is_active")
    .eq("id", payload.asesora_id)
    .maybeSingle();
  if (
    !advisorRow ||
    advisorRow.organization_id !== membership.organization_id ||
    !advisorRow.is_active ||
    !advisorRow.is_fertility_advisor
  ) {
    return NextResponse.json(
      { error: "Asesora inválida para esta organización" },
      { status: 422 },
    );
  }

  // If an appointment_id was provided (flow A — cita sidebar), confirm
  // it belongs to the org and to the same patient. Prevents a crafted
  // request from cross-linking a budget to an unrelated cita.
  if (payload.appointment_id) {
    const { data: apptRow } = await supabase
      .from("appointments")
      .select("id, organization_id, patient_id")
      .eq("id", payload.appointment_id)
      .maybeSingle();
    if (
      !apptRow ||
      apptRow.organization_id !== membership.organization_id ||
      (apptRow.patient_id && apptRow.patient_id !== payload.patient_id)
    ) {
      return NextResponse.json(
        { error: "Cita inválida para este paciente" },
        { status: 422 },
      );
    }
  }

  const treatmentType = inferTreatmentType(service.name as string);

  // ── DEDUP GUARD ────────────────────────────────────────────────
  // If the patient already has at least one budget in an active
  // state (`pending_acceptance` or `accepted`), require the caller
  // to acknowledge it. This stops a doctor in a follow-up appointment
  // from silently creating a duplicate when the patient already has
  // a pending/accepted budget from an earlier visit.
  if (!payload.acknowledged_existing) {
    const { data: activeBudgets } = await supabase
      .from("budget_records")
      .select(
        "id, treatment_type, tier, acceptance_status, sent_at, assigned_at, amount",
      )
      .eq("patient_id", payload.patient_id)
      .in("acceptance_status", ["pending_acceptance", "accepted"])
      .order("assigned_at", { ascending: false });

    if (activeBudgets && activeBudgets.length > 0) {
      return NextResponse.json(
        {
          error: "duplicate_budget",
          message:
            "Esta paciente ya tiene presupuestos activos. Confirma que quieres crear uno adicional.",
          existing: activeBudgets,
        },
        { status: 409 },
      );
    }
  }

  const insertPayload = {
    organization_id: membership.organization_id,
    patient_id: payload.patient_id,
    service_id: payload.service_id,
    tier: payload.tier,
    treatment_type: treatmentType,
    amount: Number(tierRow.amount),
    notes: payload.notes ?? null,
    acceptance_status: "pending_acceptance" as const,
    assigned_at: new Date().toISOString(),
    assigned_by_user_id: user.id,
    sent_at: null,
    sent_by_user_id: null,
    followup_id: payload.followup_id ?? null,
    // mig 167 — Phase 4 fields that the PDF generator reads to fill
    // the "Médico tratante" and "Asesora de fertilidad" cells.
    assigned_doctor_id: payload.doctor_id,
    assigned_asesora_member_id: payload.asesora_id,
    appointment_id: payload.appointment_id ?? null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("budget_records")
    .insert(insertPayload)
    .select("id, assigned_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      {
        error:
          insertErr?.message ?? "No se pudo registrar el presupuesto",
      },
      { status: 500 },
    );
  }

  // ── Phase 5 prep — transform linked upstream followup ─────────
  // If the caller linked an existing open followup that lives in the
  // upstream stages of the journey (first/second consultation lapse),
  // we transform it to `fertility.budget_pending_acceptance` instead
  // of leaving it stale. This preserves the original first_contact_at
  // (attribution honesty signal — Categoría A vs B is decided at the
  // mark-accepted step from the same flag) while extending expected_by
  // to the new phase's window.
  //
  // Dedup verification: `maybeCreateBudgetPendingFollowup` (lib/
  // fertility/followup-triggers.ts:55) queries for an existing
  // followup with rule_key='fertility.budget_pending_acceptance'
  // before inserting; the cron will see this transformed row and
  // skip creating a duplicate.
  const newBudgetId = inserted.id as string;
  if (payload.followup_id) {
    const { data: existingFollowup } = await supabase
      .from("clinical_followups")
      .select(
        "id, rule_key, status, contact_events, closed_at, organization_id",
      )
      .eq("id", payload.followup_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    if (
      existingFollowup &&
      !existingFollowup.closed_at &&
      typeof existingFollowup.rule_key === "string" &&
      (existingFollowup.rule_key === "fertility.first_consultation_lapse" ||
        existingFollowup.rule_key === "fertility.second_consultation_lapse")
    ) {
      const fromRule = existingFollowup.rule_key;
      const events = Array.isArray(existingFollowup.contact_events)
        ? (existingFollowup.contact_events as unknown[])
        : [];

      const newEvent = {
        type: "rule_transition",
        at: new Date().toISOString(),
        by_user_id: user.id,
        from_rule: fromRule,
        to_rule: "fertility.budget_pending_acceptance",
        budget_record_id: newBudgetId,
        delivery_status: "unknown",
      };

      const newExpectedBy = new Date(
        Date.now() + 90 * 24 * 3600 * 1000,
      ).toISOString();

      const transformUpdate: Record<string, unknown> = {
        rule_key: "fertility.budget_pending_acceptance",
        target_category_canonical: "fertility.treatment_initiated",
        attempt_count: 0,
        snooze_until: null,
        expected_by: newExpectedBy,
        contact_events: [...events, newEvent],
        // first_contact_at is intentionally preserved — it carries
        // the attribution signal for Categoría A (Recuperado con
        // contacto) vs Categoría B (Recuperado orgánico).
      };
      if (existingFollowup.status === "pospuesto") {
        transformUpdate.status = "pendiente";
      }

      await supabase
        .from("clinical_followups")
        .update(transformUpdate)
        .eq("id", payload.followup_id)
        .eq("organization_id", membership.organization_id);

      // Link the new budget to the (now-transformed) followup so the
      // mark-accepted/rejected closure logic finds it.
      await supabase
        .from("budget_records")
        .update({ followup_id: payload.followup_id })
        .eq("id", newBudgetId);
    }
  }

  return NextResponse.json(
    {
      id: newBudgetId,
      assigned_at: inserted.assigned_at as string,
    },
    { status: 201 },
  );
}
