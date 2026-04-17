import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

// GET /api/patients/[id]/anthropometry — chronological measurements
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

  const { data, error } = await supabase
    .from("patient_anthropometry")
    .select("*")
    .eq("patient_id", patientId)
    .order("measurement_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

const measurementSchema = z.object({
  measurement_date: z.string().min(1),
  weight_kg: z.number().positive().max(200).nullable().optional(),
  height_cm: z.number().positive().max(250).nullable().optional(),
  head_circumference_cm: z.number().positive().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// POST — create new measurement
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
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = measurementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fields = parsed.data;
  if (
    fields.weight_kg == null &&
    fields.height_cm == null &&
    fields.head_circumference_cm == null
  ) {
    return NextResponse.json(
      { error: "At least one measurement is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("patient_anthropometry")
    .insert({
      patient_id: patientId,
      organization_id: membership.organization_id,
      recorded_by: user.id,
      measurement_date: fields.measurement_date,
      weight_kg: fields.weight_kg ?? null,
      height_cm: fields.height_cm ?? null,
      head_circumference_cm: fields.head_circumference_cm ?? null,
      notes: fields.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/patients/[id]/anthropometry?entryId=...
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "missing_entry_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("patient_anthropometry")
    .delete()
    .eq("id", entryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
