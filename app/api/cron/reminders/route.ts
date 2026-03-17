import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEmailHtml } from "@/lib/email-template";
import nodemailer from "nodemailer";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, resolveVariableValues } from "@/lib/whatsapp/send";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60s for processing all orgs

/**
 * GET /api/cron/reminders
 *
 * Vercel Cron job that runs every 30 minutes.
 * Sends appointment reminders (24h and 2h before) via email.
 *
 * Security: Protected by CRON_SECRET header validation.
 */
export async function GET(req: NextRequest) {
  // 1. Validate cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Check SMTP config
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ skipped: true, reason: "smtp_not_configured" });
  }

  const supabase = createAdminClient();
  const now = new Date();

  // 3. Define reminder windows
  // We check for appointments in two windows:
  //   - 24h reminder: appointments between 23h and 25h from now
  //   - 2h reminder:  appointments between 1.5h and 2.5h from now
  const windows = [
    {
      slug: "appointment_reminder_24h",
      minHours: 23,
      maxHours: 25,
    },
    {
      slug: "appointment_reminder_2h",
      minHours: 1.5,
      maxHours: 2.5,
    },
  ];

  const results: Array<{
    slug: string;
    sent: number;
    skipped: number;
    failed: number;
  }> = [];

  for (const window of windows) {
    const windowStart = new Date(
      now.getTime() + window.minHours * 60 * 60 * 1000
    );
    const windowEnd = new Date(
      now.getTime() + window.maxHours * 60 * 60 * 1000
    );

    // Format dates for Supabase query
    const startDate = windowStart.toISOString().split("T")[0];
    const endDate = windowEnd.toISOString().split("T")[0];

    // 4. Fetch appointments in the window that haven't been reminded yet
    const { data: appointments, error: apptError } = await supabase
      .from("appointments")
      .select(
        `
        id,
        patient_name,
        patient_phone,
        patient_id,
        appointment_date,
        start_time,
        end_time,
        status,
        organization_id,
        doctors ( full_name ),
        offices ( name ),
        services ( name ),
        patients ( email, first_name, last_name, phone )
      `
      )
      .in("appointment_date", getDateRange(startDate, endDate))
      .in("status", ["scheduled", "confirmed"])
      .order("appointment_date")
      .order("start_time");

    if (apptError) {
      console.error(`[Cron Reminders] Error fetching appointments:`, apptError);
      results.push({ slug: window.slug, sent: 0, skipped: 0, failed: 1 });
      continue;
    }

    if (!appointments || appointments.length === 0) {
      results.push({ slug: window.slug, sent: 0, skipped: 0, failed: 0 });
      continue;
    }

    // Filter appointments by actual datetime within window
    const filteredAppointments = appointments.filter((appt) => {
      const apptDateTime = new Date(
        `${appt.appointment_date}T${appt.start_time}`
      );
      return apptDateTime >= windowStart && apptDateTime <= windowEnd;
    });

    // 5. Check which reminders were already sent
    const appointmentIds = filteredAppointments.map((a) => a.id);
    const { data: existingLogs } = await supabase
      .from("reminder_logs")
      .select("appointment_id")
      .in("appointment_id", appointmentIds)
      .eq("template_slug", window.slug)
      .eq("channel", "email")
      .eq("status", "sent");

    const alreadySent = new Set(
      (existingLogs || []).map((l) => l.appointment_id)
    );

    const toSend = filteredAppointments.filter(
      (a) => !alreadySent.has(a.id)
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // 6. Process each appointment
    // Group by organization to reuse template/settings lookups
    const byOrg = new Map<string, typeof toSend>();
    for (const appt of toSend) {
      const orgId = appt.organization_id;
      if (!byOrg.has(orgId)) byOrg.set(orgId, []);
      byOrg.get(orgId)!.push(appt);
    }

    for (const [orgId, orgAppointments] of byOrg) {
      // Fetch template for this org
      const { data: template } = await supabase
        .from("email_templates")
        .select("*")
        .eq("organization_id", orgId)
        .eq("slug", window.slug)
        .eq("is_enabled", true)
        .single();

      if (!template) {
        // Template not enabled — skip all appointments for this org
        skipped += orgAppointments.length;
        continue;
      }

      // Fetch email settings
      const { data: emailSettings } = await supabase
        .from("email_settings")
        .select("*")
        .eq("organization_id", orgId)
        .single();

      // Fetch org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      // Fetch clinic phone
      const { data: clinicPhoneVar } = await supabase
        .from("global_variables")
        .select("current_value")
        .eq("organization_id", orgId)
        .eq("key", "clinic_phone")
        .single();

      // Create SMTP transporter (reuse for all emails in this org)
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
      const fromName = emailSettings?.sender_name || org?.name || "VibeForge";
      const replyTo = emailSettings?.reply_to_email || undefined;
      const brandColor = emailSettings?.brand_color || "#10b981";
      const logoUrl = emailSettings?.email_logo_url || null;
      const clinicName = org?.name || emailSettings?.sender_name || "VibeForge";

      // Check if WhatsApp is configured for this org
      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .maybeSingle();

      // Find the approved WA template linked to this reminder template
      let waTemplate: WhatsAppTemplate | null = null;
      let waClient: WhatsAppClient | null = null;

      if (waConfig?.access_token && waConfig?.waba_id && waConfig?.phone_number_id && template) {
        const sendWa = template.channel === "whatsapp" || template.channel === "both";
        if (sendWa) {
          const { data: waT } = await supabase
            .from("whatsapp_templates")
            .select("*")
            .eq("organization_id", orgId)
            .eq("local_template_id", template.id)
            .eq("status", "APPROVED")
            .maybeSingle();

          if (waT) {
            waTemplate = waT as unknown as WhatsAppTemplate;
            waClient = new WhatsAppClient({
              accessToken: waConfig.access_token,
              wabaId: waConfig.waba_id,
              phoneNumberId: waConfig.phone_number_id,
            });
          }
        }
      }

      for (const appt of orgAppointments) {
        const patient = appt.patients as any;
        const patientEmail = patient?.email || null;

        if (!patientEmail) {
          skipped++;
          // Log as skipped
          await supabase.from("reminder_logs").upsert(
            {
              appointment_id: appt.id,
              template_slug: window.slug,
              channel: "email",
              recipient: "none",
              status: "skipped",
              error_message: "No patient email",
            },
            { onConflict: "appointment_id,template_slug,channel" }
          );
          continue;
        }

        // Build variables
        const doctor = appt.doctors as any;
        const office = appt.offices as any;
        const service = appt.services as any;

        const patientName = patient
          ? `${patient.first_name} ${patient.last_name}`.trim()
          : appt.patient_name;

        const formattedDate = new Date(
          appt.appointment_date + "T12:00:00"
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
          "{{hora_cita}}": appt.start_time?.slice(0, 5) || "",
          "{{consultorio}}": office?.name || "",
          "{{servicio}}": service?.name || "",
          "{{clinica_nombre}}": clinicName,
          "{{clinica_telefono}}": clinicPhoneVar?.current_value || "",
          "{{link_cancelar}}": "",
          "{{link_reagendar}}": "",
        };

        let subject = template.subject;
        let emailBody = template.body;

        for (const [key, value] of Object.entries(variables)) {
          subject = subject.replaceAll(key, value);
          emailBody = emailBody.replaceAll(key, value);
        }

        const html = buildEmailHtml({
          body: emailBody,
          brandColor,
          logoUrl,
          clinicName,
        });

        try {
          await transporter.sendMail({
            from: `${fromName} <${fromAddress}>`,
            replyTo,
            to: patientEmail,
            subject,
            html,
          });

          await supabase.from("reminder_logs").upsert(
            {
              appointment_id: appt.id,
              template_slug: window.slug,
              channel: "email",
              recipient: patientEmail,
              status: "sent",
            },
            { onConflict: "appointment_id,template_slug,channel" }
          );

          sent++;
        } catch (emailErr) {
          const errorMsg =
            emailErr instanceof Error ? emailErr.message : "Unknown error";
          console.error(
            `[Cron Reminders] Failed to send email to ${patientEmail}:`,
            errorMsg
          );

          await supabase.from("reminder_logs").upsert(
            {
              appointment_id: appt.id,
              template_slug: window.slug,
              channel: "email",
              recipient: patientEmail,
              status: "failed",
              error_message: errorMsg,
            },
            { onConflict: "appointment_id,template_slug,channel" }
          );

          failed++;
        }

        // Send WhatsApp reminder if configured
        if (waClient && waTemplate) {
          const recipientPhone = patient?.phone || appt.patient_phone;
          if (recipientPhone) {
            // Check if WA reminder already sent
            const { data: existingWaLog } = await supabase
              .from("reminder_logs")
              .select("id")
              .eq("appointment_id", appt.id)
              .eq("template_slug", window.slug)
              .eq("channel", "whatsapp")
              .eq("status", "sent")
              .maybeSingle();

            if (!existingWaLog) {
              try {
                const waVariableData: Record<string, string> = {
                  paciente_nombre: patientName || "",
                  fecha_cita: formattedDate,
                  hora_cita: appt.start_time?.slice(0, 5) || "",
                  servicio: service?.name || "",
                  doctor_nombre: doctor?.full_name || "",
                  clinica_nombre: clinicName,
                  clinica_telefono: clinicPhoneVar?.current_value || "",
                };

                const variableValues = resolveVariableValues(waTemplate, waVariableData);
                const { wamid } = await sendWhatsAppMessage(waClient, waTemplate, recipientPhone, variableValues);

                await supabase.from("whatsapp_message_logs").insert({
                  organization_id: orgId,
                  template_id: waTemplate.id,
                  recipient_phone: recipientPhone,
                  patient_id: appt.patient_id || null,
                  appointment_id: appt.id,
                  wamid,
                  status: "sent",
                });

                await supabase.from("reminder_logs").upsert(
                  {
                    appointment_id: appt.id,
                    template_slug: window.slug,
                    channel: "whatsapp",
                    recipient: recipientPhone,
                    status: "sent",
                  },
                  { onConflict: "appointment_id,template_slug,channel" }
                );
              } catch (waErr) {
                const waErrorMsg = waErr instanceof Error ? waErr.message : "WhatsApp error";
                console.error(`[Cron Reminders] WA failed for ${recipientPhone}:`, waErrorMsg);

                await supabase.from("reminder_logs").upsert(
                  {
                    appointment_id: appt.id,
                    template_slug: window.slug,
                    channel: "whatsapp",
                    recipient: recipientPhone,
                    status: "failed",
                    error_message: waErrorMsg,
                  },
                  { onConflict: "appointment_id,template_slug,channel" }
                );
              }
            }
          }
        }
      }

      transporter.close();
    }

    results.push({ slug: window.slug, sent, skipped, failed });
  }

  console.log("[Cron Reminders] Completed:", JSON.stringify(results));

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    results,
  });
}

/**
 * Returns an array of date strings (YYYY-MM-DD) between start and end inclusive.
 */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");

  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
