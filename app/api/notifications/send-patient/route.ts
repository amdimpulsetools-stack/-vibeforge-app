import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";
import { z } from "zod";

export const runtime = "nodejs";

const sendPatientSchema = z.object({
  type: z.string().min(1),
  patient_id: z.string().uuid(),
});

/**
 * POST /api/notifications/send-patient
 *
 * Sends a template email that is tied to a patient (not an appointment).
 * Used for welcome emails, birthdays, follow-ups, etc.
 *
 * Body: { type: string, patient_id: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: true, reason: "email_not_configured" });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = sendPatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { type, patient_id } = parsed.data;

  // Fetch patient
  const { data: patient } = await supabase
    .from("patients")
    .select("id, first_name, last_name, email, birth_date, organization_id")
    .eq("id", patient_id)
    .single();

  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (patient.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!patient.email) {
    return NextResponse.json({ skipped: true, reason: "no_patient_email" });
  }

  const orgId = patient.organization_id;

  // Fetch template
  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body, body_html, is_enabled")
    .eq("organization_id", orgId)
    .eq("slug", type)
    .eq("is_enabled", true)
    .single();

  if (!template) return NextResponse.json({ skipped: true, reason: "template_disabled" });

  // Fetch org + email settings
  const { data: org } = await supabase
    .from("organizations")
    .select("name, address, google_maps_url")
    .eq("id", orgId)
    .single();

  const { data: emailSettings } = await supabase
    .from("email_settings")
    .select("sender_name, reply_to_email, brand_color, email_logo_url")
    .eq("organization_id", orgId)
    .single();

  const { data: clinicPhoneVar } = await supabase
    .from("global_variables")
    .select("value")
    .eq("organization_id", orgId)
    .eq("key", "clinic_phone")
    .maybeSingle();

  const patientName = `${patient.first_name} ${patient.last_name}`.trim();
  const clinicName = org?.name || emailSettings?.sender_name || "Yenda";

  const variables: Record<string, string> = {
    "{{paciente_nombre}}": patientName,
    "{{clinica_nombre}}": clinicName,
    "{{clinica_telefono}}": clinicPhoneVar?.value || "",
    "{{direccion_clinica}}": org?.address || "",
    "{{link_ubicacion}}": org?.google_maps_url || "",
  };

  let subject = template.subject;
  let emailBody = template.body;
  let emailBodyHtml = (template as { body_html?: string | null }).body_html ?? null;
  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replaceAll(key, value);
    emailBody = emailBody.replaceAll(key, value);
    if (emailBodyHtml) {
      const escaped = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      emailBodyHtml = emailBodyHtml.replaceAll(key, escaped);
    }
  }

  const brandColor = emailSettings?.brand_color || "#10b981";
  const logoUrl = emailSettings?.email_logo_url || null;

  const html = buildEmailHtml({
    body: emailBody,
    bodyHtml: emailBodyHtml,
    brandColor,
    logoUrl,
    clinicName,
  });

  const result = await sendEmail({
    to: patient.email,
    subject,
    html,
    fromName: emailSettings?.sender_name || clinicName,
    replyTo: emailSettings?.reply_to_email || undefined,
  });

  if (!result.ok) {
    const error = result.skipped ? "email_not_configured" : result.error;
    console.error("[send-patient] error:", error);
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
