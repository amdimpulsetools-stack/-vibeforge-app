import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalNoteSchema } from "@/lib/validations/api";

// GET /api/clinical-notes?appointment_id=xxx
// Returns the clinical note for a given appointment
export async function GET(request: NextRequest) {
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
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const appointmentId = request.nextUrl.searchParams.get("appointment_id");
  const patientId = request.nextUrl.searchParams.get("patient_id");

  if (!appointmentId && !patientId) {
    return NextResponse.json(
      { error: "Se requiere appointment_id o patient_id" },
      { status: 400 }
    );
  }

  // Single note by appointment
  if (appointmentId) {
    const { data, error } = await supabase
      .from("clinical_notes")
      .select("*, doctors(full_name, color), diagnoses:clinical_note_diagnoses(*)")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (error) {
      console.error("Clinical note fetch error:", error);
      return NextResponse.json({ error: "Error al obtener nota clínica" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // All notes for a patient (history)
  const { data, error } = await supabase
    .from("clinical_notes")
    .select("*, doctors(full_name, color), diagnoses:clinical_note_diagnoses(*)")
    .eq("patient_id", patientId!)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Clinical notes fetch error:", error);
    return NextResponse.json({ error: "Error al obtener notas clínicas" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/clinical-notes — Create a new clinical note
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
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const parsed = await parseBody(request, clinicalNoteSchema);
  if (parsed.error) return parsed.error;

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify doctor belongs to current user (only the treating doctor can create notes)
  const { data: doctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("id", parsed.data.doctor_id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Allow admins to create notes on behalf of doctors
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  if (!doctor && !isAdmin) {
    return NextResponse.json(
      { error: "Solo el doctor asignado o un admin puede crear notas clínicas" },
      { status: 403 }
    );
  }

  // Separate diagnoses from the rest of the payload — they go to the join
  // table, not directly to clinical_notes (the DB trigger mirrors the primary
  // back to clinical_notes.diagnosis_code/label).
  const { diagnoses, ...notePayload } = parsed.data;

  const { data: inserted, error } = await supabase
    .from("clinical_notes")
    .insert({
      ...notePayload,
      organization_id: membership.organization_id,
      vitals: notePayload.vitals ?? {},
    })
    .select("*, doctors(full_name, color)")
    .single();

  if (error) {
    // Unique constraint violation — note already exists
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una nota clínica para esta cita" },
        { status: 409 }
      );
    }
    console.error("Clinical note create error:", error);
    return NextResponse.json({ error: "Error al crear nota clínica" }, { status: 500 });
  }

  await replaceDiagnoses(supabase, {
    noteId: inserted.id,
    organizationId: membership.organization_id,
    diagnoses,
    legacyCode: notePayload.diagnosis_code ?? null,
    legacyLabel: notePayload.diagnosis_label ?? null,
  });

  // Re-fetch with the diagnoses join so the client sees the canonical state.
  const { data: full } = await supabase
    .from("clinical_notes")
    .select("*, doctors(full_name, color), diagnoses:clinical_note_diagnoses(*)")
    .eq("id", inserted.id)
    .single();

  return NextResponse.json({ data: full ?? inserted }, { status: 201 });
}

// ─── Helpers ──────────────────────────────────────────────────────

type DiagnosisInput = {
  code: string;
  label: string;
  is_primary?: boolean;
  position?: number;
};

type ServerSupabaseClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * Replace the full set of diagnoses for a note. If `diagnoses` is undefined
 * (caller didn't send it), keep the existing rows untouched UNLESS the legacy
 * single-diagnosis fields were sent — in that case mirror them as a one-row
 * set so older callers stay coherent.
 */
export async function replaceDiagnoses(
  supabase: ServerSupabaseClient,
  args: {
    noteId: string;
    organizationId: string;
    diagnoses: DiagnosisInput[] | undefined;
    legacyCode: string | null;
    legacyLabel: string | null;
  }
) {
  let list: DiagnosisInput[] | null = null;

  if (args.diagnoses !== undefined) {
    list = args.diagnoses;
  } else if (args.legacyCode) {
    list = [
      {
        code: args.legacyCode,
        label: args.legacyLabel ?? args.legacyCode,
        is_primary: true,
        position: 0,
      },
    ];
  }

  if (list === null) return; // caller didn't touch diagnoses, leave rows alone

  await supabase
    .from("clinical_note_diagnoses")
    .delete()
    .eq("clinical_note_id", args.noteId);

  if (list.length === 0) return;

  // Force exactly one is_primary=true. If the caller didn't mark any, the
  // first wins. If they marked multiple, only the first marked stays primary.
  let primaryAssigned = false;
  const rows = list.map((d, idx) => {
    const wantPrimary = d.is_primary === true && !primaryAssigned;
    if (wantPrimary) primaryAssigned = true;
    return {
      clinical_note_id: args.noteId,
      organization_id: args.organizationId,
      code: d.code.trim(),
      label: d.label.trim(),
      is_primary: wantPrimary,
      position: d.position ?? idx,
    };
  });
  if (!primaryAssigned && rows.length > 0) rows[0].is_primary = true;

  await supabase.from("clinical_note_diagnoses").insert(rows);
}
