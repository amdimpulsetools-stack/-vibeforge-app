import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { TreatmentPlanDocument } from "@/lib/pdf/treatment-plan-document";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
} from "@/lib/pdf/clinic-header-data";
import { substituteVariables } from "@/lib/sanitize-email-html";

export const runtime = "nodejs";

// GET /api/pdf/treatment-plan/[planId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const [planRes, tplRes] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "id, organization_id, title, description, diagnosis_code, diagnosis_label, " +
          "total_sessions, start_date, estimated_end_date, " +
          "patients(first_name, last_name, dni), " +
          "doctors(full_name, cmp), " +
          "treatment_plan_items(quantity, unit_price, services(name))"
      )
      .eq("id", planId)
      .maybeSingle(),
    supabase
      .from("clinical_document_templates")
      .select("body_html, is_enabled")
      .eq("slug", "treatment_plan")
      .maybeSingle(),
  ]);

  if (planRes.error || !planRes.data) {
    return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
  }

  const plan = planRes.data as unknown as {
    id: string;
    organization_id: string;
    title: string;
    description: string | null;
    diagnosis_code: string | null;
    diagnosis_label: string | null;
    total_sessions: number | null;
    start_date: string | null;
    estimated_end_date: string | null;
    patients: { first_name: string; last_name: string; dni: string | null } | null;
    doctors: { full_name: string; cmp: string | null } | null;
    treatment_plan_items: { quantity: number; unit_price: number; services: { name: string } | null }[];
  };

  if (!plan.patients || !plan.doctors) {
    return NextResponse.json(
      { error: "El plan no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", plan.organization_id)
    .maybeSingle();

  const clinic = org ? toClinicHeaderData(org) : fallbackClinicHeader(undefined);
  const patientName = `${plan.patients.first_name} ${plan.patients.last_name}`.trim();
  const tpl = tplRes.data as { body_html: string; is_enabled: boolean } | null;

  const customBodyHtml =
    tpl?.is_enabled && tpl.body_html?.trim()
      ? substituteVariables(tpl.body_html, {
          "{{paciente_nombre}}": patientName,
          "{{paciente_dni}}": plan.patients.dni ?? "",
          "{{doctor_nombre}}": plan.doctors.full_name,
          "{{doctor_cmp}}": plan.doctors.cmp ?? "",
          "{{fecha}}": new Date().toISOString().slice(0, 10),
          "{{clinica_nombre}}": clinic.name,
        })
      : null;

  const items = plan.treatment_plan_items.map((item) => ({
    service_name: item.services?.name ?? "Servicio",
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
  }));

  const buffer = await renderToBuffer(
    <TreatmentPlanDocument
      title={plan.title}
      description={plan.description}
      diagnosisCode={plan.diagnosis_code}
      diagnosisLabel={plan.diagnosis_label}
      totalSessions={plan.total_sessions}
      startDate={plan.start_date}
      estimatedEndDate={plan.estimated_end_date}
      items={items}
      patientName={patientName}
      patientDni={plan.patients.dni}
      doctorName={plan.doctors.full_name}
      doctorCmp={plan.doctors.cmp}
      clinic={clinic}
      customBodyHtml={customBodyHtml}
    />
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="plan-tratamiento-${patientName.replace(/\s+/g, "-")}-${plan.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
