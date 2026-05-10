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
// `[id]/send` route). The schema does NOT have a dedicated column to
// store the assigned advisor (asesora) — see "ASESORA SCHEMA NOTE"
// below.
// ──────────────────────────────────────────────────────────────────

const tierEnum = z.enum(["A", "B", "C"]);

const bodySchema = z.object({
  patient_id: z.string().uuid(),
  service_id: z.string().uuid(),
  tier: tierEnum,
  asesora_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  followup_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
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

  // ── ASESORA SCHEMA NOTE ────────────────────────────────────────
  // The body accepts `asesora_id` (an organization_members.id flagged
  // as `is_fertility_advisor=true`) but `budget_records` does not
  // currently have a dedicated column to store the assigned advisor.
  //
  // `sent_by_user_id` represents the user who SENT the budget to the
  // patient (i.e. the obstetra "of turn" that clicked Enviar). It is
  // explicitly LEFT NULL here and filled in by `[id]/send`. We do
  // NOT overload it with the asesora — that would conflate "assigned
  // to advisor" with "actually sent", breaking the Sin procesar /
  // Enviado sub-bucket logic introduced in this same phase.
  //
  // The asesora_id from the body is therefore ACCEPTED at the API
  // boundary (and validated against the org) but currently NOT
  // PERSISTED. A follow-up migration in Phase 4 should add
  // `budget_records.assigned_asesora_member_id UUID REFERENCES
  // organization_members(id) ON DELETE SET NULL`. Until then this
  // field is best-effort soft-validated and the asesora dropdown in
  // the modal is informational only.
  // ───────────────────────────────────────────────────────────────
  if (payload.asesora_id) {
    const { data: advisorRow } = await supabase
      .from("organization_members")
      .select("id, organization_id, is_fertility_advisor, is_active")
      .eq("id", payload.asesora_id)
      .limit(1)
      .maybeSingle();
    if (
      !advisorRow ||
      advisorRow.organization_id !== membership.organization_id ||
      !advisorRow.is_active
    ) {
      return NextResponse.json(
        { error: "Asesora inválida para esta organización" },
        { status: 422 },
      );
    }
  }

  const treatmentType = inferTreatmentType(service.name as string);

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
