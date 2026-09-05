import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import { treatmentMoney, type TreatmentMoney } from "@/lib/treatments/money";
import type { Database } from "@/types/database";
import type {
  Treatment,
  TreatmentClinicPayment,
  TreatmentExternalPayment,
} from "@/types/treatments";

/**
 * /api/treatments/[id]/payments
 *
 *  POST   body TreatmentPaymentInput (types/treatments.ts)
 *           kind='clinic'   → INSERT en patient_payments (cobro de la clínica)
 *           kind='external' → INSERT en treatment_external_payments (la
 *                             paciente le pagó DIRECTO al tercero; informativo)
 *         Respuesta: `{ data: fila insertada, money: TreatmentMoney }`.
 *  DELETE ?payment_id=&kind=clinic|external — solo owner/admin.
 *         Respuesta: `{ ok: true, money }`.
 *
 * POR QUÉ los cobros se insertan con el cliente del USUARIO y nunca con
 * service role: el trigger de Caja (mig 213/214/226) estampa `created_by`,
 * `tender_kind` y `cash_shift_id` a partir de auth.uid() y del turno
 * abierto de quien cobra. Con service role auth.uid() es NULL y el cobro
 * quedaría fuera del arqueo de recepción. Por eso tampoco se mandan esas
 * columnas desde aquí.
 *
 * POR QUÉ `source='clinical'`: es plata de la clínica (cuenta en Ingresos,
 * en "Mis cobros" y en el arqueo). La deuda de CITAS lo excluye por
 * `treatment_id` (mig 243, lib/patient-debt.ts), no por source. Un cobro
 * vive en UN solo contenedor: sin appointment_id ni treatment_plan_id
 * (CHECK mig 242).
 */

type SupaClient = Awaited<ReturnType<typeof createClient>>;

interface MembershipRow {
  role: string;
}

type Ctx =
  | { error: NextResponse; treatment?: never; membership?: never }
  | { error?: never; treatment: Treatment; membership: MembershipRow };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clinicSchema = z.object({
  kind: z.literal("clinic"),
  amount: z.number().positive("El monto debe ser mayor a 0").max(99999999.99),
  concept_id: z.string().uuid(),
  payment_method: z.string().trim().min(1).max(50),
  payment_date: z.string().regex(DATE_RE, "Fecha inválida").optional(),
  notes: z.string().max(1000).optional(),
  external_receipt_ref: z.string().max(100).optional(),
});

const externalSchema = z.object({
  kind: z.literal("external"),
  amount: z.number().positive("El monto debe ser mayor a 0").max(99999999.99),
  concept_id: z.string().uuid().nullable().optional(),
  payee_name: z.string().max(200).optional(),
  paid_on: z.string().regex(DATE_RE, "Fecha inválida").optional(),
  notes: z.string().max(1000).optional(),
});

const bodySchema = z.discriminatedUnion("kind", [clinicSchema, externalSchema]);

async function loadContext(supabase: SupaClient, userId: string, id: string): Promise<Ctx> {
  const { data: row } = await supabase.from("treatments").select("*").eq("id", id).maybeSingle();
  const treatment = (row as Treatment | null) ?? null;
  if (!treatment) {
    return { error: NextResponse.json({ error: "Tratamiento no encontrado" }, { status: 404 }) };
  }

  const denied = await assertActiveMembership(supabase, userId, treatment.organization_id);
  if (denied) return { error: denied };

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
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

/** Recalcula el dinero del tratamiento con la fórmula única tras cada escritura. */
async function recomputeMoney(
  supabase: SupaClient,
  treatment: Treatment,
): Promise<TreatmentMoney> {
  const [{ data: payments }, { data: external }] = await Promise.all([
    supabase
      .from("patient_payments")
      .select("amount, source, revenue_bucket")
      .eq("treatment_id", treatment.id),
    supabase.from("treatment_external_payments").select("amount").eq("treatment_id", treatment.id),
  ]);
  return treatmentMoney(
    treatment.expected_total,
    (payments ?? []) as Array<{ amount: number; source: string | null; revenue_bucket: string | null }>,
    (external ?? []) as Array<{ amount: number }>,
  );
}

/** Errores de triggers/CHECK (Caja, contenedor único, concepto) → HTTP. */
function mapDbError(err: { code?: string; message?: string }, fallback: string): NextResponse {
  const msg = err.message ?? "";
  if (err.code === "42501") return NextResponse.json({ error: msg || fallback }, { status: 403 });
  if (err.code === "23514" || err.code === "23505" || err.code === "P0001") {
    return NextResponse.json({ error: msg || fallback }, { status: 409 });
  }
  return NextResponse.json({ error: msg || fallback }, { status: 500 });
}

export async function POST(
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

  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      return NextResponse.json({ error: first ?? "Datos inválidos" }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ctx = await loadContext(supabase, user.id, id);
  if (ctx.error) return ctx.error;
  const { treatment } = ctx;

  if (treatment.status !== "in_progress") {
    return NextResponse.json(
      { error: "El tratamiento está cerrado: no admite nuevos pagos" },
      { status: 409 },
    );
  }

  // El concepto debe ser de la org y estar activo (el trigger de la 242
  // también lo valida, pero aquí el mensaje es claro y el status un 400).
  const conceptId = input.concept_id ?? null;
  if (conceptId) {
    const { data: concept } = await supabase
      .from("treatment_payment_concepts")
      .select("id")
      .eq("id", conceptId)
      .eq("organization_id", treatment.organization_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!concept) {
      return NextResponse.json({ error: "Concepto de pago inválido o inactivo" }, { status: 400 });
    }
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", treatment.organization_id)
    .maybeSingle();
  const today = todayInTz(
    resolveOrgTimezone((orgRow as { timezone?: string | null } | null)?.timezone),
  );

  if (input.kind === "clinic") {
    const insert: Database["public"]["Tables"]["patient_payments"]["Insert"] = {
      organization_id: treatment.organization_id,
      patient_id: treatment.patient_id,
      treatment_id: treatment.id,
      treatment_concept_id: input.concept_id,
      amount: input.amount,
      payment_method: input.payment_method,
      // Default = "hoy" en el reloj de la org (mig 240), no en UTC.
      payment_date: input.payment_date ?? today,
      notes: input.notes?.trim() || null,
      external_receipt_ref: input.external_receipt_ref?.trim() || null,
      source: "clinical",
    };
    const { data: row, error: insErr } = await supabase
      .from("patient_payments")
      .insert(insert)
      .select(
        "id, amount, payment_method, payment_date, notes, source, treatment_id, " +
          "treatment_concept_id, revenue_bucket, external_receipt_ref, created_by, " +
          "created_at, cash_shift_id, einvoice_id",
      )
      .single();
    if (insErr || !row) {
      return mapDbError(insErr ?? {}, "No se pudo registrar el cobro");
    }
    const inserted = row as unknown as TreatmentClinicPayment;
    const payment: TreatmentClinicPayment = { ...inserted, amount: Number(inserted.amount) };
    const money = await recomputeMoney(supabase, treatment);
    return NextResponse.json({ data: payment, money }, { status: 201 });
  }

  const insert: Database["public"]["Tables"]["treatment_external_payments"]["Insert"] = {
    organization_id: treatment.organization_id,
    treatment_id: treatment.id,
    concept_id: input.concept_id ?? null,
    amount: input.amount,
    payee_name: input.payee_name?.trim() || null,
    paid_on: input.paid_on ?? today,
    notes: input.notes?.trim() || null,
    created_by: user.id,
  };
  const { data: row, error: insErr } = await supabase
    .from("treatment_external_payments")
    .insert(insert)
    .select("*")
    .single();
  if (insErr || !row) {
    return mapDbError(insErr ?? {}, "No se pudo registrar el pago a tercero");
  }
  const external = { ...(row as unknown as TreatmentExternalPayment), amount: Number(row.amount) };
  const money = await recomputeMoney(supabase, treatment);
  return NextResponse.json({ data: external, money }, { status: 201 });
}

export async function DELETE(
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

  const sp = request.nextUrl.searchParams;
  const paymentId = sp.get("payment_id");
  const kind = sp.get("kind");
  if (!paymentId || !z.string().uuid().safeParse(paymentId).success) {
    return NextResponse.json({ error: "Falta payment_id" }, { status: 400 });
  }
  if (kind !== "clinic" && kind !== "external") {
    return NextResponse.json({ error: "kind debe ser clinic o external" }, { status: 400 });
  }

  const ctx = await loadContext(supabase, user.id, id);
  if (ctx.error) return ctx.error;
  const { treatment, membership } = ctx;

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Solo dirección puede eliminar pagos" }, { status: 403 });
  }

  if (kind === "clinic") {
    // Si el turno de Caja ya está cerrado, el trigger (mig 214) rechaza el
    // DELETE con check_violation: se devuelve su mensaje tal cual (409).
    const { data: deleted, error: delErr } = await supabase
      .from("patient_payments")
      .delete()
      .eq("id", paymentId)
      .eq("treatment_id", treatment.id)
      .eq("organization_id", treatment.organization_id)
      .select("id");
    if (delErr) return mapDbError(delErr, "No se pudo eliminar el cobro");
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Cobro no encontrado" }, { status: 404 });
    }
  } else {
    const { data: deleted, error: delErr } = await supabase
      .from("treatment_external_payments")
      .delete()
      .eq("id", paymentId)
      .eq("treatment_id", treatment.id)
      .select("id");
    if (delErr) return mapDbError(delErr, "No se pudo eliminar el pago");
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }
  }

  const money = await recomputeMoney(supabase, treatment);
  return NextResponse.json({ ok: true, money });
}
