import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { ConsentDocument } from "@/lib/pdf/consent-document";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
} from "@/lib/pdf/clinic-header-data";
import { substituteVariables } from "@/lib/sanitize-email-html";
import { CONSENT_TYPE_LABELS, type InformedConsentType } from "@/types/informed-consent";

export const runtime = "nodejs";

// GET /api/pdf/consent/[consentId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ consentId: string }> }
) {
  const { consentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const [consentRes, tplRes] = await Promise.all([
    supabase
      .from("informed_consents")
      .select(
        "id, organization_id, consent_type, procedure_description, risks_explained, " +
          "signed_by_patient_name, signed_at, signature_method, signature_data, " +
          "patients(first_name, last_name, dni), " +
          "doctors(full_name, cmp), " +
          "services(name)"
      )
      .eq("id", consentId)
      .maybeSingle(),
    supabase
      .from("clinical_document_templates")
      .select("body_html, is_enabled")
      .eq("slug", "consent")
      .maybeSingle(),
  ]);

  if (consentRes.error || !consentRes.data) {
    return NextResponse.json({ error: "Consentimiento no encontrado" }, { status: 404 });
  }

  const consent = consentRes.data as unknown as {
    id: string;
    organization_id: string;
    consent_type: InformedConsentType;
    procedure_description: string;
    risks_explained: string | null;
    signed_by_patient_name: string;
    signed_at: string;
    signature_method: "typed" | "drawn";
    signature_data: string | null;
    patients: { first_name: string; last_name: string; dni: string | null } | null;
    doctors: { full_name: string; cmp: string | null } | null;
    services: { name: string } | null;
  };

  if (!consent.patients || !consent.doctors) {
    return NextResponse.json(
      { error: "El consentimiento no tiene paciente o doctor asociado" },
      { status: 400 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", consent.organization_id)
    .maybeSingle();

  const clinic = org ? toClinicHeaderData(org) : fallbackClinicHeader(undefined);
  const patientName = `${consent.patients.first_name} ${consent.patients.last_name}`.trim();
  const tpl = tplRes.data as { body_html: string; is_enabled: boolean } | null;

  const customBodyHtml =
    tpl?.is_enabled && tpl.body_html?.trim()
      ? substituteVariables(tpl.body_html, {
          "{{paciente_nombre}}": patientName,
          "{{paciente_dni}}": consent.patients.dni ?? "",
          "{{doctor_nombre}}": consent.doctors.full_name,
          "{{doctor_cmp}}": consent.doctors.cmp ?? "",
          "{{fecha}}": consent.signed_at.slice(0, 10),
          "{{clinica_nombre}}": clinic.name,
          "{{procedimiento}}": consent.procedure_description,
        })
      : null;

  const buffer = await renderToBuffer(
    <ConsentDocument
      consentLabel={CONSENT_TYPE_LABELS[consent.consent_type] ?? consent.consent_type}
      procedureDescription={consent.procedure_description}
      risksExplained={consent.risks_explained}
      serviceName={consent.services?.name ?? null}
      patientName={patientName}
      patientDni={consent.patients.dni}
      doctorName={consent.doctors.full_name}
      doctorCmp={consent.doctors.cmp}
      signedByPatientName={consent.signed_by_patient_name}
      signedAt={consent.signed_at}
      signatureMethod={consent.signature_method}
      signatureImageDataUrl={consent.signature_data}
      clinic={clinic}
      customBodyHtml={customBodyHtml}
    />
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consentimiento-${patientName.replace(/\s+/g, "-")}-${consent.signed_at.slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
