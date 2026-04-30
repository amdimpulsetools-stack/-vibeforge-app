import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { renderInformedConsentHtml } from "@/lib/pdf/informed-consent-html";
import { toClinicHeaderData } from "@/lib/pdf/clinic-header-data";
import type {
  InformedConsentRecord,
  InformedConsentSignatureMethod,
  InformedConsentType,
} from "@/types/informed-consent";

const consentTypeEnum = z.enum(["general", "procedimiento", "tratamiento", "fotografias"]);
const signatureMethodEnum = z.enum(["typed", "drawn"]);

const createSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  doctor_id: z.string().uuid().nullable().optional(),
  consent_type: consentTypeEnum,
  procedure_description: z.string().min(1).max(4000),
  risks_explained: z.string().max(4000).nullable().optional(),
  signed_by_patient_name: z.string().min(2).max(200),
  signature_method: signatureMethodEnum,
  signature_data: z.string().max(200_000).nullable().optional(),
});

interface PatientRow {
  first_name: string | null;
  last_name: string | null;
  dni: string | null;
  organization_id: string | null;
}

interface DoctorRow {
  full_name: string | null;
  cmp: string | null;
}

interface ServiceRow {
  name: string | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const appointmentId = request.nextUrl.searchParams.get("appointment_id");

  // Require at least one scoping filter — RLS already restricts to the
  // user's org, but listing every consent in the org is rarely useful
  // and can leak signed PDFs of patients the caller has no business
  // touching from a UI perspective.
  if (!patientId && !appointmentId) {
    return NextResponse.json(
      { error: "Especifica patient_id o appointment_id" },
      { status: 400 },
    );
  }

  let query = supabase
    .from("informed_consents")
    .select("*")
    .order("signed_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);
  if (appointmentId) query = query.eq("appointment_id", appointmentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate fresh signed URLs for any consent that has a stored path.
  const rows = (data ?? []) as InformedConsentRecord[];
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (!row.pdf_url || row.pdf_url.startsWith("http")) return row;
      const { data: signed } = await supabase.storage
        .from("informed-consents")
        .createSignedUrl(row.pdf_url, 60 * 60); // 1 hour
      return { ...row, pdf_url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ data: enriched });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership)
    return NextResponse.json({ error: "No organization" }, { status: 403 });

  const organizationId = membership.organization_id;

  // Pull org branding + patient + (optional) doctor + service for the
  // letterhead and the consent body.
  const [orgRes, patientRes, doctorRes, serviceRes] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", organizationId).single(),
    supabase
      .from("patients")
      .select("first_name, last_name, dni, organization_id")
      .eq("id", payload.patient_id)
      .single(),
    payload.doctor_id
      ? supabase
          .from("doctors")
          .select("full_name, cmp")
          .eq("id", payload.doctor_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    payload.service_id
      ? supabase
          .from("services")
          .select("name")
          .eq("id", payload.service_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!orgRes.data || !patientRes.data) {
    return NextResponse.json(
      { error: "No se encontró la organización o el paciente" },
      { status: 404 },
    );
  }

  const patient = patientRes.data as PatientRow;

  // Defense in depth on top of RLS: refuse if the patient does not
  // belong to the caller's org. Prevents cross-tenant consent rows
  // even if a future RLS regression slips through.
  if (patient.organization_id !== organizationId) {
    return NextResponse.json(
      { error: "El paciente no pertenece a tu organización" },
      { status: 403 },
    );
  }
  const doctor = (doctorRes.data ?? null) as DoctorRow | null;
  const service = (serviceRes.data ?? null) as ServiceRow | null;

  // 1. Insert the row first to obtain an id we can use for the storage path.
  const insertPayload = {
    organization_id: organizationId,
    patient_id: payload.patient_id,
    appointment_id: payload.appointment_id ?? null,
    service_id: payload.service_id ?? null,
    doctor_id: payload.doctor_id ?? null,
    consent_type: payload.consent_type satisfies InformedConsentType,
    procedure_description: payload.procedure_description,
    risks_explained: payload.risks_explained ?? null,
    signed_by_patient_name: payload.signed_by_patient_name,
    signature_method: payload.signature_method satisfies InformedConsentSignatureMethod,
    signature_data: payload.signature_data ?? null,
    created_by: user.id,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("informed_consents")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "No se pudo registrar el consentimiento" },
      { status: 500 },
    );
  }

  const consentRow = inserted as InformedConsentRecord;

  // 2. Render HTML and upload. PDF conversion is deferred — the bucket
  // accepts both application/pdf and text/html for forward compat.
  const html = renderInformedConsentHtml({
    org: toClinicHeaderData(orgRes.data),
    patientName: [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim(),
    patientDocument: patient.dni ?? null,
    doctorName: doctor?.full_name ?? null,
    doctorCmp: doctor?.cmp ?? null,
    consentType: payload.consent_type,
    procedureDescription: payload.procedure_description,
    risksExplained: payload.risks_explained ?? null,
    serviceName: service?.name ?? null,
    signedByPatientName: payload.signed_by_patient_name,
    signedAt: new Date(consentRow.signed_at),
    signatureMethod: payload.signature_method,
    signatureImageDataUrl:
      payload.signature_method === "drawn" && payload.signature_data
        ? payload.signature_data
        : null,
  });

  const path = `${organizationId}/${consentRow.id}.html`;
  const { error: uploadError } = await supabase.storage
    .from("informed-consents")
    .upload(path, new Blob([html], { type: "text/html" }), {
      contentType: "text/html",
      upsert: false,
    });

  if (uploadError) {
    // The row exists but the artifact failed. Surface the error so the
    // operator can retry — the row itself is still legally valid since
    // signature_data is persisted in DB.
    return NextResponse.json(
      {
        data: consentRow,
        warning: "Consentimiento registrado pero el archivo no se pudo guardar: " + uploadError.message,
      },
      { status: 201 },
    );
  }

  // Persist the storage path (not a signed URL) so it never expires.
  // Signed URLs are generated on demand when the client fetches the consent.
  await supabase
    .from("informed_consents")
    .update({ pdf_url: path })
    .eq("id", consentRow.id);

  return NextResponse.json(
    {
      data: { ...consentRow, pdf_url: path },
    },
    { status: 201 },
  );
}
