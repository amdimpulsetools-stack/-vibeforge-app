import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { ExamOrderDocument } from "@/lib/pdf/exam-order-document";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
} from "@/lib/pdf/clinic-header-data";
import { substituteVariables } from "@/lib/sanitize-email-html";

export const runtime = "nodejs";

// GET /api/pdf/exam-order/[orderId]
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
        "id, organization_id, diagnosis, diagnosis_code, notes, appointment_id, " +
          "exam_order_items(exam_name, instructions), " +
          "doctors(full_name, cmp), " +
          "patients(first_name, last_name, dni), " +
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
    diagnosis: string | null;
    diagnosis_code: string | null;
    notes: string | null;
    appointment_id: string | null;
    exam_order_items: { exam_name: string; instructions: string | null }[];
    doctors: { full_name: string; cmp: string | null } | null;
    patients: { first_name: string; last_name: string; dni: string | null } | null;
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

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", order.organization_id)
    .maybeSingle();

  const clinic = org ? toClinicHeaderData(org) : fallbackClinicHeader(undefined);
  const patientName = `${order.patients.first_name} ${order.patients.last_name}`.trim();
  const appointmentDate = order.appointments?.appointment_date ?? new Date().toISOString().slice(0, 10);
  const tpl = tplRes.data as { body_html: string; is_enabled: boolean } | null;

  const customBodyHtml =
    tpl?.is_enabled && tpl.body_html?.trim()
      ? substituteVariables(tpl.body_html, {
          "{{paciente_nombre}}": patientName,
          "{{paciente_dni}}": order.patients.dni ?? "",
          "{{doctor_nombre}}": order.doctors.full_name,
          "{{doctor_cmp}}": order.doctors.cmp ?? "",
          "{{fecha}}": appointmentDate,
          "{{clinica_nombre}}": clinic.name,
        })
      : null;

  const buffer = await renderToBuffer(
    <ExamOrderDocument
      items={order.exam_order_items}
      diagnosis={order.diagnosis}
      diagnosisCode={order.diagnosis_code}
      notes={order.notes}
      patientName={patientName}
      patientDni={order.patients.dni}
      doctorName={order.doctors.full_name}
      doctorCmp={order.doctors.cmp}
      appointmentDate={appointmentDate}
      clinic={clinic}
      customBodyHtml={customBodyHtml}
    />
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orden-examenes-${patientName.replace(/\s+/g, "-")}-${appointmentDate}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
