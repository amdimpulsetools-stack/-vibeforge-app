import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalNoteUpdateSchema, signNoteSchema } from "@/lib/validations/api";

// PATCH /api/clinical-notes/[id] — Update a clinical note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Verify the note belongs to the user's organization
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: noteCheck } = await supabase
    .from("clinical_notes")
    .select("organization_id")
    .eq("id", id)
    .single();

  if (!noteCheck || noteCheck.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if this is a sign request
  let raw: unknown;
  try {
    raw = await request.clone().json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isSignRequest = (raw as any)?.is_signed === true;

  if (isSignRequest) {
    // Sign the note — lock it from further edits
    const parsed = signNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clinical_notes")
      .update({
        is_signed: true,
        signed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, doctors(full_name, color)")
      .single();

    if (error) {
      console.error("Clinical note sign error:", error);
      return NextResponse.json({ error: "Error al firmar nota clínica" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // Regular update
  const parsed = await parseBody(
    new Request(request.url, {
      method: "PATCH",
      body: JSON.stringify(raw),
      headers: request.headers,
    }),
    clinicalNoteUpdateSchema
  );
  if (parsed.error) return parsed.error;

  // Save version snapshot before updating (audit trail)
  const { data: currentNote } = await supabase
    .from("clinical_notes")
    .select("id, organization_id, subjective, objective, assessment, plan, diagnosis_code, diagnosis_label, vitals, internal_notes")
    .eq("id", id)
    .single();

  if (currentNote && (currentNote.subjective || currentNote.objective || currentNote.assessment || currentNote.plan)) {
    // Get next version number
    const { count } = await supabase
      .from("clinical_note_versions")
      .select("*", { count: "exact", head: true })
      .eq("clinical_note_id", id);

    const versionNumber = (count ?? 0) + 1;

    // Determine what changed
    const changes: string[] = [];
    if (parsed.data.subjective !== undefined && parsed.data.subjective !== currentNote.subjective) changes.push("Subjetivo");
    if (parsed.data.objective !== undefined && parsed.data.objective !== currentNote.objective) changes.push("Objetivo");
    if (parsed.data.assessment !== undefined && parsed.data.assessment !== currentNote.assessment) changes.push("Evaluación");
    if (parsed.data.plan !== undefined && parsed.data.plan !== currentNote.plan) changes.push("Plan");
    if (parsed.data.diagnosis_code !== undefined && parsed.data.diagnosis_code !== currentNote.diagnosis_code) changes.push("Diagnóstico");
    if (parsed.data.vitals !== undefined) changes.push("Signos vitales");

    if (changes.length > 0) {
      await supabase.from("clinical_note_versions").insert({
        clinical_note_id: id,
        organization_id: currentNote.organization_id,
        edited_by: user.id,
        version_number: versionNumber,
        subjective: currentNote.subjective,
        objective: currentNote.objective,
        assessment: currentNote.assessment,
        plan: currentNote.plan,
        diagnosis_code: currentNote.diagnosis_code,
        diagnosis_label: currentNote.diagnosis_label,
        vitals: currentNote.vitals ?? {},
        internal_notes: currentNote.internal_notes,
        change_summary: `Editado: ${changes.join(", ")}`,
      });
    }
  }

  const { data, error } = await supabase
    .from("clinical_notes")
    .update({
      ...parsed.data,
      vitals: parsed.data.vitals ?? undefined,
    })
    .eq("id", id)
    .select("*, doctors(full_name, color)")
    .single();

  if (error) {
    console.error("Clinical note update error:", error);
    return NextResponse.json({ error: "Error al actualizar nota clínica" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/clinical-notes/[id] — Delete a clinical note (admin only, enforced by RLS)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { error } = await supabase
    .from("clinical_notes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Clinical note delete error:", error);
    return NextResponse.json({ error: "Error al eliminar nota clínica" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
