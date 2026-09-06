import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import { renderDocumentHtml } from "@/lib/pdf/html/render";
import { htmlToPdfBuffer } from "@/lib/pdf/html/chromium";
import {
  ORG_DOC_COLUMNS,
  buildPrescriptionDocData,
  fileSlug,
  patientFullName,
  type DocDoctor,
  type DocPatient,
  type DocTemplate,
  type OrgDocRow,
  type PrescriptionRow,
} from "@/lib/pdf/prescription-data";

export const runtime = "nodejs"; // Chromium headless (puppeteer-core) no corre en edge

// GET /api/pdf/prescription/[appointmentId]
// Receta de la cita: todas las prescripciones ACTIVAS de esa cita, con el
// cuerpo editable `clinical_document_templates(slug='prescription')` de la
// org. Motor: Handlebars (lib/pdf/html/templates/prescription.hbs) →
// Chromium. Las recetas creadas por lote (mig 247) se imprimen por
// /api/pdf/prescription/batch/[batchId].
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

  // 1. Cita + prescripciones + template en paralelo. RLS scopea cada query
  // a la org del usuario: una cita ajena no aparece → 404 limpio.
  const [apptRes, rxRes, tplRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, organization_id, patient_id, appointment_date, " +
          "patients(first_name, last_name, dni, birth_date), " +
          "doctors(full_name, cmp)"
      )
      .eq("id", appointmentId)
      .maybeSingle(),
    supabase
      .from("prescriptions")
      .select(
        "medication, dosage, frequency, duration, route, quantity, instructions, " +
          "pharmaceutical_form, dose_per_take"
      )
      .eq("appointment_id", appointmentId)
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("clinical_document_templates")
      // Sin filtro de org aquí: la org sale del documento (más abajo). Un
      // usuario con dos clínicas recibe una fila por org (UNIQUE org+slug),
      // así que se elige la de ESTA org en vez de maybeSingle().
      .select("organization_id, body_html, is_enabled")
      .eq("slug", "prescription"),
  ]);

  if (apptRes.error || !apptRes.data) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const appt = apptRes.data as unknown as {
    id: string;
    organization_id: string;
    patient_id: string | null;
    appointment_date: string;
    patients: DocPatient | null;
    doctors: DocDoctor | null;
  };

  if (!appt.patients || !appt.doctors) {
    return NextResponse.json(
      { error: "La cita no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  if (rxRes.error) {
    return NextResponse.json({ error: rxRes.error.message }, { status: 500 });
  }
  const prescriptions = (rxRes.data ?? []) as unknown as PrescriptionRow[];
  if (prescriptions.length === 0) {
    return NextResponse.json(
      { error: "Esta cita no tiene recetas activas para imprimir" },
      { status: 400 }
    );
  }

  // 2. Branding real de la org (Ajustes → General) + zona horaria.
  const { data: orgRow } = await supabase
    .from("organizations")
    .select(ORG_DOC_COLUMNS)
    .eq("id", appt.organization_id)
    .maybeSingle();
  if (!orgRow) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }
  const org = orgRow as unknown as OrgDocRow;

  // La fecha del documento es la de la cita (date civil, sin hora).
  const date = String(appt.appointment_date).slice(0, 10);

  // 3. Render.
  const data = buildPrescriptionDocData({
    org,
    codeSource: appointmentId,
    date,
    patient: appt.patients,
    doctor: appt.doctors,
    prescriptions,
    template: ((tplRes.data ?? []) as Array<DocTemplate & { organization_id: string }>).find(
      (t) => t.organization_id === appt.organization_id,
    ) ?? null,
  });
  const html = await renderDocumentHtml("prescription.hbs", data);
  const pdf = await htmlToPdfBuffer(html);

  logClinicalAccess({
    organizationId: appt.organization_id,
    userId: user.id,
    resourceType: "prescription",
    action: "print",
    patientId: appt.patient_id,
    resourceId: appointmentId,
    metadata: { document: "prescription_pdf", appointment_id: appointmentId, count: prescriptions.length },
  });

  const patientName = patientFullName(appt.patients);
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receta-${fileSlug(patientName)}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
