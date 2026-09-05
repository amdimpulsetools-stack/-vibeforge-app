import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import { treatmentMoney } from "@/lib/treatments/money";
import type { Database } from "@/types/database";
import type {
  Treatment,
  TreatmentClinicPayment,
  TreatmentDetailResponse,
  TreatmentExternalPayment,
  TreatmentPaymentConcept,
} from "@/types/treatments";

/**
 * /api/treatments/[id]
 *
 *  GET   → TreatmentDetailResponse (types/treatments.ts).
 *  PATCH → `{ notes?, assistant_member_id?, doctor_id?, expected_total? }`.
 *          `expected_total` solo owner/admin (es el monto acordado: mover
 *          ese número cambia el "pendiente" de la paciente); el resto
 *          owner/admin/doctor/asesora. Devuelve `{ data: Treatment }`.
 *
 * La org sale del PROPIO tratamiento (RLS ya oculta los ajenos) y luego se
 * exige membresía activa en ella — nunca `limit(1)` sobre membresías.
 */

type SupaClient = Awaited<ReturnType<typeof createClient>>;

interface MembershipRow {
  role: string;
  is_fertility_advisor: boolean | null;
}

interface TreatmentRow extends Treatment {
  patients: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  doctors: { full_name: string | null } | null;
  budget_records: { amount: number | string | null; tier: string | null } | null;
}

/** Columnas de patient_payments que consume el módulo (TreatmentClinicPayment). */
const PAYMENT_COLUMNS =
  "id, amount, payment_method, payment_date, notes, source, treatment_id, " +
  "treatment_concept_id, revenue_bucket, external_receipt_ref, created_by, " +
  "created_at, cash_shift_id, einvoice_id";

type Ctx =
  | { error: NextResponse; treatment?: never; membership?: never }
  | { error?: never; treatment: TreatmentRow; membership: MembershipRow };

async function loadContext(supabase: SupaClient, userId: string, id: string): Promise<Ctx> {
  const { data: row } = await supabase
    .from("treatments")
    .select("*, patients(first_name, last_name, phone), doctors(full_name), budget_records(amount, tier)")
    .eq("id", id)
    .maybeSingle();
  const treatment = (row as unknown as TreatmentRow | null) ?? null;
  if (!treatment) {
    return { error: NextResponse.json({ error: "Tratamiento no encontrado" }, { status: 404 }) };
  }

  const denied = await assertActiveMembership(supabase, userId, treatment.organization_id);
  if (denied) return { error: denied };
  const noAddon = await assertFertilityAddon(supabase, treatment.organization_id);
  if (noAddon) return { error: noAddon };

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role, is_fertility_advisor")
    .eq("user_id", userId)
    .eq("organization_id", treatment.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return { error: NextResponse.json({ error: "No perteneces a esta organización" }, { status: 403 }) };
  }
  return { treatment, membership };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const ctx = await loadContext(supabase, user.id, id);
  if (ctx.error) return ctx.error;
  const { treatment: row, membership } = ctx;
  const { patients, doctors, budget_records, ...treatment } = row;

  const [paymentsRes, externalRes, conceptsRes, assistantRes] = await Promise.all([
    supabase
      .from("patient_payments")
      .select(PAYMENT_COLUMNS)
      .eq("treatment_id", id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("treatment_external_payments")
      .select("*")
      .eq("treatment_id", id)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("treatment_payment_concepts")
      .select("*")
      .eq("organization_id", treatment.organization_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("label", { ascending: true }),
    treatment.assistant_member_id
      ? supabase
          .from("organization_members")
          .select("user_id")
          .eq("id", treatment.assistant_member_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Nombre de la asistente: user_profiles es visible entre pares de la org
  // (mig 071), así que el cliente del usuario alcanza.
  let assistantName: string | null = null;
  const assistantUserId = (assistantRes.data as { user_id: string } | null)?.user_id;
  if (assistantUserId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", assistantUserId)
      .maybeSingle();
    assistantName = (profile as { full_name: string | null } | null)?.full_name ?? null;
  }

  const payments = ((paymentsRes.data ?? []) as unknown as TreatmentClinicPayment[]).map((p) => ({
    ...p,
    amount: Number(p.amount),
  }));
  const externalPayments = ((externalRes.data ?? []) as unknown as TreatmentExternalPayment[]).map(
    (e) => ({ ...e, amount: Number(e.amount) }),
  );
  const concepts = (conceptsRes.data ?? []) as unknown as TreatmentPaymentConcept[];

  const role = membership.role;
  const isAdmin = role === "owner" || role === "admin";
  const seesFees = isAdmin || role === "doctor";
  const patientName = [patients?.first_name, patients?.last_name].filter(Boolean).join(" ").trim();

  // Un doctor solo ve el detalle de SUS tratamientos (o de los que no tienen
  // doctora asignada) — mismo scope que la lista y que treatment_close (245).
  if (role === "doctor" && treatment.doctor_id) {
    const { data: ownDoctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("organization_id", treatment.organization_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if ((ownDoctor as { id: string } | null)?.id !== treatment.doctor_id) {
      return NextResponse.json(
        { error: "Este tratamiento pertenece a otra doctora" },
        { status: 403 },
      );
    }
  }

  const body: TreatmentDetailResponse = {
    treatment: {
      ...(treatment as Treatment),
      expected_total: Number(treatment.expected_total),
      patient_name: patientName,
      patient_phone: patients?.phone ?? null,
      doctor_name: doctors?.full_name ?? null,
      assistant_name: assistantName,
      budget_amount: budget_records?.amount != null ? Number(budget_records.amount) : null,
      budget_tier: budget_records?.tier ?? null,
    },
    payments,
    external_payments: externalPayments,
    concepts,
    // Fórmula única (lib/treatments/money.ts): filtra source='clinical' sola.
    money: treatmentMoney(treatment.expected_total, payments, externalPayments),
    sees_fees: seesFees,
    can_close: seesFees && treatment.status === "in_progress",
    can_reopen: isAdmin && treatment.status !== "in_progress",
  };

  return NextResponse.json(body);
}

const patchSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    assistant_member_id: z.string().uuid().nullable().optional(),
    doctor_id: z.string().uuid().nullable().optional(),
    expected_total: z.number().min(0).max(99999999.99).optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  let input: z.infer<typeof patchSchema>;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ctx = await loadContext(supabase, user.id, id);
  if (ctx.error) return ctx.error;
  const { treatment, membership } = ctx;

  const role = membership.role;
  const isAdmin = role === "owner" || role === "admin";
  const canEdit = isAdmin || role === "doctor" || Boolean(membership.is_fertility_advisor);
  if (!canEdit) {
    return NextResponse.json({ error: "Sin permisos para editar el tratamiento" }, { status: 403 });
  }
  if (input.expected_total !== undefined && !isAdmin) {
    return NextResponse.json(
      { error: "Solo dirección puede cambiar el monto acordado" },
      { status: 403 },
    );
  }

  const update: Database["public"]["Tables"]["treatments"]["Update"] = {};
  if (input.notes !== undefined) {
    update.notes = input.notes === null ? null : input.notes.trim() || null;
  }
  if (input.expected_total !== undefined) update.expected_total = input.expected_total;

  // Doctor y asistente deben ser de la MISMA org (RLS no lo garantiza:
  // solo exige que el tratamiento sea de una org del usuario).
  if (input.doctor_id !== undefined) {
    if (input.doctor_id !== null) {
      const { data: doc } = await supabase
        .from("doctors")
        .select("id")
        .eq("id", input.doctor_id)
        .eq("organization_id", treatment.organization_id)
        .maybeSingle();
      if (!doc) {
        return NextResponse.json({ error: "Doctor no encontrado en esta organización" }, { status: 400 });
      }
    }
    update.doctor_id = input.doctor_id;
  }
  if (input.assistant_member_id !== undefined) {
    if (input.assistant_member_id !== null) {
      const { data: member } = await supabase
        .from("organization_members")
        .select("id")
        .eq("id", input.assistant_member_id)
        .eq("organization_id", treatment.organization_id)
        .eq("is_active", true)
        .maybeSingle();
      if (!member) {
        return NextResponse.json({ error: "Miembro no encontrado en esta organización" }, { status: 400 });
      }
    }
    update.assistant_member_id = input.assistant_member_id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  // Un tratamiento cerrado solo admite notas: el resto reescribiría la
  // historia de un ciclo terminado (reabrir primero, owner/admin).
  const touchesStructure = Object.keys(update).some((k) => k !== "notes");
  if (touchesStructure && treatment.status !== "in_progress") {
    return NextResponse.json(
      { error: "El tratamiento está cerrado; reábrelo para editarlo" },
      { status: 409 },
    );
  }

  const { data: updated, error: updErr } = await supabase
    .from("treatments")
    .update(update)
    .eq("id", id)
    .eq("organization_id", treatment.organization_id)
    .select("*")
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "No se pudo actualizar el tratamiento" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: updated as Treatment });
}
