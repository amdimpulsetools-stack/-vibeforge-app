import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  ClinicalNoteDocument,
  type ClinicalNoteVitals,
} from "@/lib/pdf/clinical-note-document";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
} from "@/lib/pdf/clinic-header-data";
import { substituteVariables } from "@/lib/sanitize-email-html";

export const runtime = "nodejs";

// GET /api/pdf/clinical-note/[noteId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const { noteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // Cargar nota + relaciones en paralelo.
  const [noteRes, tplRes] = await Promise.all([
    supabase
      .from("clinical_notes")
      .select(
        "id, organization_id, subjective, objective, assessment, plan, " +
          "diagnosis_code, diagnosis_label, vitals, is_signed, signed_at, " +
          "appointment_id, " +
          "diagnoses:clinical_note_diagnoses(code, label, is_primary, position), " +
          "doctors(full_name, cmp), " +
          "appointments(appointment_date, start_time, services(name), patients(first_name, last_name, dni))"
      )
      .eq("id", noteId)
      .maybeSingle(),
    supabase
      .from("clinical_document_templates")
      .select("body_html, is_enabled")
      .eq("slug", "clinical_note")
      .maybeSingle(),
  ]);

  if (noteRes.error || !noteRes.data) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }

  const note = noteRes.data as unknown as {
    id: string;
    organization_id: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    diagnosis_code: string | null;
    diagnosis_label: string | null;
    vitals: ClinicalNoteVitals | null;
    is_signed: boolean;
    signed_at: string | null;
    appointment_id: string | null;
    diagnoses: { code: string; label: string; is_primary: boolean; position: number }[];
    doctors: { full_name: string; cmp: string | null } | null;
    appointments: {
      appointment_date: string;
      start_time: string | null;
      services: { name: string } | null;
      patients: { first_name: string; last_name: string; dni: string | null } | null;
    } | null;
  };

  const patients = note.appointments?.patients;
  if (!patients || !note.doctors) {
    return NextResponse.json(
      { error: "La nota no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", note.organization_id)
    .maybeSingle();

  const clinic = org ? toClinicHeaderData(org) : fallbackClinicHeader(undefined);
  const patientName = `${patients.first_name} ${patients.last_name}`.trim();
  const tpl = tplRes.data as { body_html: string; is_enabled: boolean } | null;

  const customBodyHtml =
    tpl?.is_enabled && tpl.body_html?.trim()
      ? substituteVariables(tpl.body_html, {
          "{{paciente_nombre}}": patientName,
          "{{paciente_dni}}": patients.dni ?? "",
          "{{doctor_nombre}}": note.doctors.full_name,
          "{{doctor_cmp}}": note.doctors.cmp ?? "",
          "{{fecha}}": note.appointments?.appointment_date ?? "",
          "{{clinica_nombre}}": clinic.name,
        })
      : null;

  // Lista de diagnósticos: usa la tabla nueva si existe, sino fallback
  // a las columnas legacy diagnosis_code/label.
  const diagnoses = note.diagnoses?.length
    ? note.diagnoses.map((d) => ({
        code: d.code,
        label: d.label,
        is_primary: d.is_primary,
      }))
    : note.diagnosis_code
      ? [{ code: note.diagnosis_code, label: note.diagnosis_label ?? note.diagnosis_code, is_primary: true }]
      : [];

  const buffer = await renderToBuffer(
    <ClinicalNoteDocument
      subjective={note.subjective}
      objective={note.objective}
      assessment={note.assessment}
      plan={note.plan}
      diagnoses={diagnoses}
      vitals={note.vitals ?? {}}
      isSigned={note.is_signed}
      signedAt={note.signed_at}
      patientName={patientName}
      patientDni={patients.dni}
      doctorName={note.doctors.full_name}
      doctorCmp={note.doctors.cmp}
      serviceName={note.appointments?.services?.name ?? null}
      appointmentDate={note.appointments?.appointment_date ?? ""}
      appointmentTime={note.appointments?.start_time?.slice(0, 5) ?? null}
      clinic={clinic}
      customBodyHtml={customBodyHtml}
    />
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="nota-clinica-${patientName.replace(/\s+/g, "-")}-${note.appointments?.appointment_date ?? "sd"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
