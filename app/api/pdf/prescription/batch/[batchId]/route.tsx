import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/pdf/prescription/batch/[batchId]
// Receta de un LOTE (mig 247): los medicamentos recetados en un mismo
// gesto desde la cita o desde el drawer del paciente, con o sin cita.
// Imprime las filas activas con ese `batch_id`; 404 si no hay ninguna
// (o si el lote es de otra org: RLS).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  if (!UUID_RE.test(batchId)) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const [rxRes, tplRes] = await Promise.all([
    supabase
      .from("prescriptions")
      .select(
        "id, organization_id, patient_id, doctor_id, start_date, " +
          "medication, dosage, frequency, duration, route, quantity, instructions, " +
          "pharmaceutical_form, dose_per_take, " +
          "patients(first_name, last_name, dni, birth_date), " +
          "doctors(full_name, cmp)"
      )
      .eq("batch_id", batchId)
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

  if (rxRes.error) {
    return NextResponse.json({ error: rxRes.error.message }, { status: 500 });
  }

  type BatchRow = PrescriptionRow & {
    id: string;
    organization_id: string;
    patient_id: string;
    doctor_id: string;
    start_date: string | null;
    patients: DocPatient | null;
    doctors: DocDoctor | null;
  };
  const rows = (rxRes.data ?? []) as unknown as BatchRow[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const first = rows[0];

  // `batch_id` lo genera el cliente: si dos POST distintos reutilizaran el
  // mismo uuid (o un usuario de dos clínicas lo cruzara entre orgs), aquí
  // se imprimirían medicamentos de otro paciente bajo la cabecera del
  // primero. Un lote válido es SIEMPRE un paciente, un médico y una org.
  const mixed = rows.some(
    (r) =>
      r.patient_id !== first.patient_id ||
      r.doctor_id !== first.doctor_id ||
      r.organization_id !== first.organization_id,
  );
  if (mixed) {
    return NextResponse.json(
      { error: "El lote contiene recetas de distintos pacientes o médicos" },
      { status: 409 },
    );
  }

  if (!first.patients || !first.doctors) {
    return NextResponse.json(
      { error: "La receta no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select(ORG_DOC_COLUMNS)
    .eq("id", first.organization_id)
    .maybeSingle();
  if (!orgRow) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }
  const org = orgRow as unknown as OrgDocRow;

  // Fecha del documento: start_date del lote; si no hay, "hoy" civil en
  // la zona de la org (nunca new Date().toISOString(): Vercel corre en UTC).
  const tz = resolveOrgTimezone(org.timezone);
  const date = first.start_date ? String(first.start_date).slice(0, 10) : todayInTz(tz);

  const data = buildPrescriptionDocData({
    org,
    codeSource: batchId,
    date,
    patient: first.patients,
    doctor: first.doctors,
    prescriptions: rows,
    template: ((tplRes.data ?? []) as Array<DocTemplate & { organization_id: string }>).find(
      (t) => t.organization_id === first.organization_id,
    ) ?? null,
  });
  const html = await renderDocumentHtml("prescription.hbs", data);
  const pdf = await htmlToPdfBuffer(html);

  logClinicalAccess({
    organizationId: first.organization_id,
    userId: user.id,
    resourceType: "prescription",
    action: "print",
    patientId: first.patient_id,
    resourceId: batchId,
    metadata: { document: "prescription_pdf", batch_id: batchId, count: rows.length },
  });

  const patientName = patientFullName(first.patients);
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receta-${fileSlug(patientName)}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
