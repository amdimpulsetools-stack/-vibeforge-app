import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { PrescriptionDocument } from "@/lib/pdf/prescription-document";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
} from "@/lib/pdf/clinic-header-data";
import { substituteVariables } from "@/lib/sanitize-email-html";

export const runtime = "nodejs"; // @react-pdf/renderer no funciona en edge

// GET /api/pdf/prescription/[appointmentId]
// Renderiza el PDF de la receta de la cita usando el template
// `clinical_document_templates(slug='prescription')` de la org.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // 1. Cargar todo en paralelo: appointment + prescriptions + template + org.
  // RLS scopea cada query a la org del usuario; si la cita no pertenece, los
  // joins fallan → 404 limpio.
  const [apptRes, rxRes, tplRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, organization_id, appointment_date, " +
          "patients(first_name, last_name, dni), " +
          "doctors(full_name, cmp)"
      )
      .eq("id", appointmentId)
      .maybeSingle(),
    supabase
      .from("prescriptions")
      .select(
        "medication, dosage, frequency, duration, route, quantity, instructions, is_active"
      )
      .eq("appointment_id", appointmentId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("clinical_document_templates")
      .select("body_html, is_enabled")
      .eq("slug", "prescription")
      .maybeSingle(),
  ]);

  if (apptRes.error || !apptRes.data) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const appt = apptRes.data as unknown as {
    id: string;
    organization_id: string;
    appointment_date: string;
    patients: { first_name: string; last_name: string; dni: string | null } | null;
    doctors: { full_name: string; cmp: string | null } | null;
  };

  if (!appt.patients || !appt.doctors) {
    return NextResponse.json(
      { error: "La cita no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  const prescriptions = (rxRes.data ?? []) as Array<{
    medication: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    quantity: string | null;
    instructions: string | null;
    is_active: boolean;
  }>;

  if (prescriptions.length === 0) {
    return NextResponse.json(
      { error: "Esta cita no tiene recetas activas para imprimir" },
      { status: 400 }
    );
  }

  // 2. Cargar org para el membrete.
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", appt.organization_id)
    .maybeSingle();

  const clinic = org
    ? toClinicHeaderData(org)
    : fallbackClinicHeader(undefined);

  // 3. Substituir variables en el template (si está habilitado y no vacío).
  const patientName = `${appt.patients.first_name} ${appt.patients.last_name}`.trim();
  const tpl = tplRes.data as { body_html: string; is_enabled: boolean } | null;
  const customBodyHtml =
    tpl?.is_enabled && tpl.body_html?.trim()
      ? substituteVariables(tpl.body_html, {
          "{{paciente_nombre}}": patientName,
          "{{paciente_dni}}": appt.patients.dni ?? "",
          "{{doctor_nombre}}": appt.doctors.full_name,
          "{{doctor_cmp}}": appt.doctors.cmp ?? "",
          "{{fecha}}": appt.appointment_date,
          "{{clinica_nombre}}": clinic.name,
        })
      : null;

  // 4. Render PDF.
  const buffer = await renderToBuffer(
    <PrescriptionDocument
      prescriptions={prescriptions}
      patientName={patientName}
      patientDni={appt.patients.dni}
      doctorName={appt.doctors.full_name}
      doctorCmp={appt.doctors.cmp}
      appointmentDate={appt.appointment_date}
      clinic={clinic}
      customBodyHtml={customBodyHtml}
    />
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receta-${patientName.replace(/\s+/g, "-")}-${appt.appointment_date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
