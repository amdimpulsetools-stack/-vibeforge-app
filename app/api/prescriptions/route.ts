import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { logClinicalAccess, logClinicalBatchAccess } from "@/lib/audit/clinical-access";

const prescriptionSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  clinical_note_id: z.string().uuid().nullable().optional(),
  // Mig 247 — lote de impresión + forma farmacéutica + dosis por toma.
  batch_id: z.string().uuid().nullable().optional(),
  pharmaceutical_form: z.string().max(50).nullable().optional(),
  dose_per_take: z.string().max(100).nullable().optional(),
  medication: z.string().min(1).max(200),
  dosage: z.string().max(100).nullable().optional(),
  frequency: z.string().max(100).nullable().optional(),
  duration: z.string().max(100).nullable().optional(),
  route: z.string().max(50).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  quantity: z.string().max(50).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

/**
 * Recetar es un acto médico: recepción NO receta. Los roles administrativos
 * (owner/admin) sí pueden registrar la receta de un médico de su clínica
 * — es lo que ya hacían desde la historia clínica — pero un `doctor` solo
 * puede firmar con SU propia ficha.
 */
const CLINICAL_WRITE_ROLES = new Set(["owner", "admin", "doctor"]);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const appointmentId = request.nextUrl.searchParams.get("appointment_id");

  let query = supabase
    .from("prescriptions")
    .select("*, doctors(full_name)")
    .order("created_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);
  if (appointmentId) query = query.eq("appointment_id", appointmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data && data.length > 0) {
    logClinicalAccess({
      organizationId: data[0].organization_id,
      userId: user.id,
      resourceType: "prescription",
      action: "list",
      patientId: patientId,
      metadata: {
        count: data.length,
        appointment_id: appointmentId ?? null,
      },
    });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Support batch creation (array of prescriptions)
  const isBatch = Array.isArray(body);
  const items: unknown[] = isBatch ? (body as unknown[]) : [body];
  if (items.length === 0) {
    return NextResponse.json({ error: "Sin prescripciones que guardar" }, { status: 400 });
  }

  const parsedItems = items.map((item: unknown) => prescriptionSchema.safeParse(item));
  const firstError = parsedItems.find((p: { success: boolean }) => !p.success);
  if (firstError && !firstError.success) {
    return NextResponse.json({ error: "Datos inválidos", details: firstError.error.flatten().fieldErrors }, { status: 400 });
  }

  const validItems = parsedItems.map(
    (p) => (p as { success: true; data: z.infer<typeof prescriptionSchema> }).data,
  );
  const firstItem = validItems[0];

  // Un lote = un paciente y un médico firmante. Si no, la org y el firmante
  // que se validan abajo no cubrirían al resto de las filas.
  if (
    validItems.some(
      (i) =>
        i.patient_id !== firstItem.patient_id || i.doctor_id !== firstItem.doctor_id,
    )
  ) {
    return NextResponse.json(
      { error: "Todas las prescripciones deben ser del mismo paciente y médico" },
      { status: 400 },
    );
  }

  // La organización sale del PACIENTE, no de una membresía arbitraria: con
  // `organization_members … limit(1)` un usuario de dos clínicas podía
  // escribir la receta en la org equivocada (mismo bug corregido en
  // lib/followups/org-scope.ts).
  const { data: patient } = await supabase
    .from("patients")
    .select("organization_id")
    .eq("id", firstItem.patient_id)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  const organizationId = patient.organization_id as string;

  // Membresía ACTIVA en ESA org (get_user_org_ids() del RLS no mira is_active).
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a esta organización" },
      { status: 403 },
    );
  }
  if (!CLINICAL_WRITE_ROLES.has(membership.role as string)) {
    return NextResponse.json(
      { error: "Tu rol no puede crear prescripciones" },
      { status: 403 },
    );
  }

  // El firmante debe ser un médico de esta org; si quien escribe es un
  // doctor, además tiene que ser SU propia ficha.
  const { data: signer } = await supabase
    .from("doctors")
    .select("id, user_id")
    .eq("id", firstItem.doctor_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!signer) {
    return NextResponse.json(
      { error: "El médico firmante no pertenece a esta organización" },
      { status: 403 },
    );
  }
  if (membership.role === "doctor" && signer.user_id !== user.id) {
    return NextResponse.json(
      { error: "Solo puedes recetar con tu propia ficha de médico" },
      { status: 403 },
    );
  }

  // Server-side guard: if the linked clinical note is signed, forbid creating new prescriptions
  if (firstItem.appointment_id) {
    const { data: note } = await supabase
      .from("clinical_notes")
      .select("is_signed")
      .eq("appointment_id", firstItem.appointment_id)
      .maybeSingle();
    if (note?.is_signed === true) {
      return NextResponse.json(
        { error: "La nota clínica está firmada. No se pueden crear nuevas prescripciones." },
        { status: 403 }
      );
    }
  }

  const insertData = validItems.map((item) => ({
    ...item,
    organization_id: organizationId,
  }));

  const { data, error } = await supabase
    .from("prescriptions")
    .insert(insertData)
    .select("*, doctors(full_name)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isBatch) {
    logClinicalBatchAccess({
      organizationId,
      userId: user.id,
      resourceType: "prescription",
      action: "create",
      patientId: firstItem.patient_id,
      batchCount: data?.length ?? 0,
      metadata: { appointment_id: firstItem.appointment_id ?? null },
    });
  } else if (data?.[0]) {
    logClinicalAccess({
      organizationId,
      userId: user.id,
      resourceType: "prescription",
      action: "create",
      patientId: firstItem.patient_id,
      resourceId: data[0].id,
    });
  }

  // `batch_id` (mig 247) vuelve al cliente para abrir el PDF del lote
  // recién creado — /api/pdf/prescription/batch/[batchId].
  return NextResponse.json(
    {
      data: isBatch ? data : data?.[0],
      batch_id: firstItem.batch_id ?? null,
    },
    { status: 201 },
  );
}
