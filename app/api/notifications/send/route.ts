import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { parseBody } from "@/lib/api-utils";
import { sendNotificationSchema } from "@/lib/validations/api";
import nodemailer from "nodemailer";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, resolveVariableValues } from "@/lib/whatsapp/send";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";

export const runtime = "nodejs";

/**
 * POST /api/notifications/send
 *
 * Sends an automated email notification based on the organization's email templates.
 *
 * Body:
 *   type: string — template slug (e.g. "appointment_confirmation", "payment_receipt")
 *   appointment_id: string — appointment UUID
 *   extra_variables?: Record<string, string> — additional variables to replace
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Check SMTP configuration
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    // Silently skip — SMTP not configured yet
    return NextResponse.json({ skipped: true, reason: "smtp_not_configured" });
  }

  const parsed = await parseBody(req, sendNotificationSchema);
  if (parsed.error) return parsed.error;
  const { type, appointment_id, extra_variables } = parsed.data;

  // 1. Fetch appointment with relations
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select(
      `
      *,
      doctors ( full_name ),
      offices ( name ),
      services ( name ),
      patients ( email, first_name, last_name, phone )
    `
    )
    .eq("id", appointment_id)
    .single();

  if (apptError || !appointment) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  // Determine recipient email — patient email from patients table or from extra_variables
  const patientEmail =
    extra_variables?.patient_email ||
    (appointment.patients as any)?.email ||
    null;

  if (!patientEmail) {
    // No email on file — can't send, skip silently
    return NextResponse.json({ skipped: true, reason: "no_patient_email" });
  }

  const orgId = appointment.organization_id;

  // 2. Fetch email template for this org + type
  const { data: template } = await supabase
    .from("email_templates")
    .select("*")
    .eq("organization_id", orgId)
    .eq("slug", type)
    .eq("is_enabled", true)
    .single();

  if (!template) {
    // Template not enabled or not found — skip
    return NextResponse.json({ skipped: true, reason: "template_disabled" });
  }

  // 3. Fetch email settings for branding
  const { data: emailSettings } = await supabase
    .from("email_settings")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  // 4. Fetch clinic phone from global_variables
  const { data: clinicPhoneVar } = await supabase
    .from("global_variables")
    .select("current_value")
    .eq("organization_id", orgId)
    .eq("key", "clinic_phone")
    .single();

  // 5. Fetch organization name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // 6. Build variables map
  const doctor = appointment.doctors as any;
  const office = appointment.offices as any;
  const service = appointment.services as any;
  const patient = appointment.patients as any;

  const patientName =
    patient
      ? `${patient.first_name} ${patient.last_name}`.trim()
      : appointment.patient_name;

  const formattedDate = new Date(
    appointment.appointment_date + "T12:00:00"
  ).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const variables: Record<string, string> = {
    "{{paciente_nombre}}": patientName || "",
    "{{doctor_nombre}}": doctor?.full_name || "",
    "{{fecha_cita}}": formattedDate,
    "{{hora_cita}}": appointment.start_time?.slice(0, 5) || "",
    "{{consultorio}}": office?.name || "",
    "{{servicio}}": service?.name || "",
    "{{clinica_nombre}}": org?.name || "",
    "{{clinica_telefono}}": clinicPhoneVar?.current_value || "",
    "{{link_cancelar}}": "", // TODO: generate public links
    "{{link_reagendar}}": "",
    "{{link_reunion}}": (appointment as any).meeting_url || "",
    "{{monto_pagado}}": extra_variables?.monto_pagado || "",
    ...(extra_variables || {}),
  };

  // 7. Replace variables in subject and body
  let subject = template.subject;
  let emailBody = template.body;

  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replaceAll(key, value);
    emailBody = emailBody.replaceAll(key, value);
  }

  // 8. Build HTML
  const brandColor = emailSettings?.brand_color || "#10b981";
  const logoUrl = emailSettings?.email_logo_url || null;
  const clinicName = org?.name || emailSettings?.sender_name || "VibeForge";

  const html = buildEmailHtml({
    body: emailBody,
    brandColor,
    logoUrl,
    clinicName,
  });

  // 9. Determine which channels to send on
  const sendEmail = true; // Email always sent if template is enabled
  const sendWhatsApp = !!template.wa_enabled;

  const results: { email?: { success: boolean; messageId?: string }; whatsapp?: { success: boolean; wamid?: string } } = {};

  // 9a. Send email
  if (sendEmail && patientEmail && smtpHost && smtpUser && smtpPass) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      const fromAddress = process.env.SMTP_FROM || smtpUser;
      const fromName = emailSettings?.sender_name || clinicName;
      const replyTo = emailSettings?.reply_to_email || undefined;

      const info = await transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        replyTo,
        to: patientEmail,
        subject,
        html,
      });

      results.email = { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error("[Notification SMTP Error]", message);
      results.email = { success: false };
    }
  }

  // 9b. Send WhatsApp
  if (sendWhatsApp) {
    const recipientPhone = patient?.phone || appointment.patient_phone;

    if (recipientPhone) {
      try {
        // Fetch WhatsApp config for this org
        const { data: waConfig } = await supabase
          .from("whatsapp_config")
          .select("*")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .single();

        if (waConfig?.access_token && waConfig?.waba_id && waConfig?.phone_number_id) {
          // Find the corresponding approved WA template
          const { data: waTemplate } = await supabase
            .from("whatsapp_templates")
            .select("*")
            .eq("organization_id", orgId)
            .eq("local_template_id", template.id)
            .eq("status", "APPROVED")
            .single();

          if (waTemplate) {
            const client = new WhatsAppClient({
              accessToken: waConfig.access_token,
              wabaId: waConfig.waba_id,
              phoneNumberId: waConfig.phone_number_id,
            });

            // Build variable values from our internal variables
            const waVariableData: Record<string, string> = {
              paciente_nombre: patientName || "",
              paciente_dni: patient?.dni || "",
              paciente_telefono: recipientPhone,
              fecha_cita: formattedDate,
              hora_cita: appointment.start_time?.slice(0, 5) || "",
              servicio: service?.name || "",
              doctor_nombre: doctor?.full_name || "",
              clinica_nombre: org?.name || "",
              clinica_telefono: clinicPhoneVar?.current_value || "",
              monto_pagado: extra_variables?.monto_pagado || "",
            };

            const typedWaTemplate = waTemplate as unknown as WhatsAppTemplate;
            const variableValues = resolveVariableValues(typedWaTemplate, waVariableData);

            const { wamid } = await sendWhatsAppMessage(
              client,
              typedWaTemplate,
              recipientPhone,
              variableValues
            );

            // Log the message
            await supabase.from("whatsapp_message_logs").insert({
              organization_id: orgId,
              template_id: waTemplate.id,
              recipient_phone: recipientPhone,
              patient_id: appointment.patient_id || null,
              appointment_id: appointment.id,
              wamid,
              status: "sent",
            });

            results.whatsapp = { success: true, wamid };
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error WA desconocido";
        console.error("[Notification WhatsApp Error]", message);
        results.whatsapp = { success: false };
      }
    }
  }

  // If no channel succeeded, return error
  if (!results.email?.success && !results.whatsapp?.success && (sendEmail || sendWhatsApp)) {
    return NextResponse.json(
      { error: "No se pudo enviar por ningún canal" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    to: patientEmail,
    ...results,
  });
}
