import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { PatientAntecedents } from "@/types/patient-antecedents";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

// GET /api/patients/[id]/antecedents — fetch all antecedents + recent diagnoses
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [allergies, conditions, medications, diagnoses] = await Promise.all([
    supabase
      .from("patient_allergies")
      .select("*")
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_conditions")
      .select("*")
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .order("condition_type")
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_medications")
      .select("*")
      .eq("patient_id", patientId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("clinical_notes")
      .select("diagnosis_code, diagnosis_label, created_at, doctors(full_name)")
      .eq("patient_id", patientId)
      .not("diagnosis_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const result: PatientAntecedents = {
    allergies: allergies.data ?? [],
    conditions: conditions.data ?? [],
    medications: medications.data ?? [],
    recentDiagnoses: (diagnoses.data ?? []).map((d) => ({
      code: d.diagnosis_code ?? "",
      label: d.diagnosis_label ?? "",
      date: d.created_at,
      doctor_name: (d.doctors as unknown as { full_name: string } | null)?.full_name ?? null,
    })),
  };

  // Antecedents bundle reads everything sensitive on the patient
  // (allergies, conditions, meds). Always audit. We grab the org
  // from the first row available — the patient must belong to
  // exactly one org by schema invariant.
  const orgId =
    (allergies.data?.[0] as { organization_id?: string } | undefined)?.organization_id ??
    (conditions.data?.[0] as { organization_id?: string } | undefined)?.organization_id ??
    (medications.data?.[0] as { organization_id?: string } | undefined)?.organization_id ??
    null;
  if (orgId) {
    logClinicalAccess({
      organizationId: orgId,
      userId: user.id,
      resourceType: "medical_history",
      action: "view",
      patientId: patientId,
      metadata: {
        allergies_count: allergies.data?.length ?? 0,
        conditions_count: conditions.data?.length ?? 0,
        medications_count: medications.data?.length ?? 0,
      },
    });
  }

  return NextResponse.json(result);
}

// POST /api/patients/[id]/antecedents — add allergy, condition, or medication
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  const body = await request.json();
  const { type, ...fields } = body;

  const tableMap: Record<string, string> = {
    allergy: "patient_allergies",
    condition: "patient_conditions",
    medication: "patient_medications",
  };

  const table = tableMap[type];
  if (!table) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(table)
    .insert({
      ...fields,
      patient_id: patientId,
      organization_id: membership.organization_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logClinicalAccess({
    organizationId: membership.organization_id,
    userId: user.id,
    resourceType: "medical_history",
    action: "create",
    patientId: patientId,
    resourceId: data?.id ?? null,
    metadata: { kind: type },
  });

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/patients/[id]/antecedents — update an entry
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, id: entryId, ...fields } = body;

  const tableMap: Record<string, string> = {
    allergy: "patient_allergies",
    condition: "patient_conditions",
    medication: "patient_medications",
  };

  const table = tableMap[type];
  if (!table || !entryId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(table)
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.organization_id) {
    logClinicalAccess({
      organizationId: data.organization_id,
      userId: user.id,
      resourceType: "medical_history",
      action: "update",
      patientId: patientId,
      resourceId: entryId,
      metadata: { kind: type },
    });
  }

  return NextResponse.json(data);
}

// DELETE /api/patients/[id]/antecedents — soft-delete (set is_active = false)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const entryId = searchParams.get("entryId");

  const tableMap: Record<string, string> = {
    allergy: "patient_allergies",
    condition: "patient_conditions",
    medication: "patient_medications",
  };

  const table = type ? tableMap[type] : null;
  if (!table || !entryId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Pull org context from the row before we soft-delete it.
  const { data: row } = await supabase
    .from(table)
    .select("organization_id")
    .eq("id", entryId)
    .maybeSingle();

  const { error } = await supabase
    .from(table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", entryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (row?.organization_id) {
    logClinicalAccess({
      organizationId: row.organization_id,
      userId: user.id,
      resourceType: "medical_history",
      action: "delete",
      patientId: patientId,
      resourceId: entryId,
      metadata: { kind: type, soft_delete: true },
    });
  }

  return NextResponse.json({ ok: true });
}
