import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import { buildOrgDocBlock } from "@/lib/pdf/html/org";
import { formatShortDate, renderDocumentHtml } from "@/lib/pdf/html/render";
import { htmlToPdfBuffer } from "@/lib/pdf/html/chromium";
import {
  ORG_DOC_COLUMNS,
  clinicalDocVariables,
  docCode,
  fileSlug,
  generatedFooterNote,
  patientDoctorMeta,
  patientFullName,
  renderTemplateBody,
  type DocDoctor,
  type DocPatient,
  type DocTemplate,
  type OrgDocRow,
} from "@/lib/pdf/prescription-data";

export const runtime = "nodejs"; // Chromium headless (puppeteer-core) no corre en edge

// GET /api/pdf/exam-order/[orderId]
// Orden de examen con el cuerpo editable `clinical_document_templates
// (slug='exam_order')`. Motor: Handlebars (exam-order.hbs) → Chromium.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const [orderRes, tplRes] = await Promise.all([
    supabase
      .from("exam_orders")
      .select(
        "id, organization_id, patient_id, diagnosis, diagnosis_code, notes, " +
          "appointment_id, created_at, " +
          "exam_order_items(exam_name, instructions), " +
          "doctors(full_name, cmp), " +
          "patients(first_name, last_name, dni, birth_date), " +
          "appointments(appointment_date)"
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("clinical_document_templates")
      .select("body_html, is_enabled")
      .eq("slug", "exam_order")
      .maybeSingle(),
  ]);

  if (orderRes.error || !orderRes.data) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  const order = orderRes.data as unknown as {
    id: string;
    organization_id: string;
    patient_id: string;
    diagnosis: string | null;
    diagnosis_code: string | null;
    notes: string | null;
    appointment_id: string | null;
    created_at: string;
    exam_order_items: { exam_name: string; instructions: string | null }[];
    doctors: DocDoctor | null;
    patients: DocPatient | null;
    appointments: { appointment_date: string } | null;
  };

  if (!order.patients || !order.doctors) {
    return NextResponse.json(
      { error: "La orden no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  if (!order.exam_order_items?.length) {
    return NextResponse.json(
      { error: "Esta orden no tiene exámenes para imprimir" },
      { status: 400 }
    );
  }

  const { data: orgRes } = await supabase
    .from("organizations")
    .select(ORG_DOC_COLUMNS)
    .eq("id", order.organization_id)
    .maybeSingle();
  if (!orgRes) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }
  const orgRow = orgRes as unknown as OrgDocRow;

  // Fecha civil del documento: la de la cita; sin cita, el día en que se
  // creó la orden EN LA ZONA DE LA ORG (antes caía a new Date() en UTC).
  const tz = resolveOrgTimezone(orgRow.timezone);
  const date = order.appointments?.appointment_date
    ? String(order.appointments.appointment_date).slice(0, 10)
    : todayInTz(tz, new Date(order.created_at));

  const org = buildOrgDocBlock(orgRow);
  const patientName = patientFullName(order.patients);

  const diagnosis = (order.diagnosis ?? "").trim();
  const diagnosisCode = (order.diagnosis_code ?? "").trim();
  const meta = [
    ...patientDoctorMeta(order.patients, order.doctors, date),
    {
      label: "Diagnóstico",
      // Sin texto pero con código: el código es el valor.
      value: diagnosis || diagnosisCode,
      hint: diagnosis && diagnosisCode ? `CIE-10 ${diagnosisCode}` : "",
      // Sexta celda: siempre fila propia (la plantilla la estira a todo el
      // ancho). Si no hay diagnóstico, el partial omite la celda.
      wide: true,
    },
  ];

  const items = order.exam_order_items.map((it) => ({
    name: (it.exam_name ?? "").trim(),
    hint: (it.instructions ?? "").trim(),
  }));
  const n = items.length;

  const data = {
    doc: {
      title: "Orden de examen",
      eyebrow: "Solicitud",
      code: docCode("OX", orderId),
      issued_label: `Emitida ${formatShortDate(date)}`,
      footer_note: generatedFooterNote(tz),
    },
    org,
    meta,
    items,
    count_label: n === 1 ? "1 examen" : `${n} exámenes`,
    notes: (order.notes ?? "").trim(),
    body_html: renderTemplateBody(
      (tplRes.data as DocTemplate | null) ?? null,
      clinicalDocVariables({
        patient: order.patients,
        doctor: order.doctors,
        date,
        orgName: org.display_name,
      }),
    ),
    signer: {
      name: order.doctors.full_name,
      role: "Médico tratante",
      cmp: order.doctors.cmp?.trim() ?? "",
    },
  };

  const html = await renderDocumentHtml("exam-order.hbs", data);
  const pdf = await htmlToPdfBuffer(html);

  // Mismo resource_type que el resto de rutas de órdenes de examen.
  logClinicalAccess({
    organizationId: order.organization_id,
    userId: user.id,
    resourceType: "lab_result",
    action: "print",
    patientId: order.patient_id,
    resourceId: orderId,
    metadata: { document: "exam_order_pdf", count: n },
  });

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orden-examenes-${fileSlug(patientName)}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
