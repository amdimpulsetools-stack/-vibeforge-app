import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCronRun, finishCronRun } from "@/lib/cron-runs";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, resolveVariableValues } from "@/lib/whatsapp/send";
import { decrypt } from "@/lib/encryption";
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

  if (!cronSecret || cronSecret.length < 32 || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Check email config
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: true, reason: "email_not_configured" });
  }

  const supabase = createAdminClient();
  const runId = await startCronRun(supabase, "reminders");
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
        created_at,
        patient_name,
        patient_phone,
        patient_id,
        appointment_date,
        start_time,
        end_time,
        status,
        organization_id,
        price_snapshot,
        discount_amount,
        doctors ( full_name ),
        offices ( name ),
        services ( name, base_price, pre_appointment_instructions, send_reminders ),
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
      if (apptDateTime < windowStart || apptDateTime > windowEnd) return false;

      // Solo recordar citas agendadas ANTES de que se abriera la ventana de
      // este recordatorio: si la paciente agendó hace pocas horas, el correo
      // de confirmación que acaba de recibir YA cumple el rol de recordatorio
      // — mandarle ambos casi seguidos se percibe como spam robótico.
      // (Ej.: cita agendada 20h antes → sin recordatorio de 24h, pero el de
      // 2h sí saldrá porque 20h > 2.5h.)
      if (appt.created_at) {
        const bookedMsBeforeAppt =
          apptDateTime.getTime() - new Date(appt.created_at).getTime();
        if (bookedMsBeforeAppt <= window.maxHours * 60 * 60 * 1000) {
          return false;
        }
      }
      return true;
    });

    // 5. Check which reminders were already sent — PER CHANNEL.
    // Email and WhatsApp are independent channels: a reminder that already
    // went out by email must still be retried by WhatsApp in future runs
    // (and vice-versa), so we keep a separate "already sent" set per channel.
    const appointmentIds = filteredAppointments.map((a) => a.id);
    const { data: existingLogs } = await supabase
      .from("reminder_logs")
      .select("appointment_id, channel")
      .in("appointment_id", appointmentIds)
      .eq("template_slug", window.slug)
      .in("channel", ["email", "whatsapp"])
      .eq("status", "sent");

    const emailAlreadySent = new Set(
      (existingLogs || [])
        .filter((l) => l.channel === "email")
        .map((l) => l.appointment_id)
    );
    const waAlreadySent = new Set(
      (existingLogs || [])
        .filter((l) => l.channel === "whatsapp")
        .map((l) => l.appointment_id)
    );

    // Process any appointment still pending on at least one channel.
    const toSend = filteredAppointments.filter(
      (a) => !emailAlreadySent.has(a.id) || !waAlreadySent.has(a.id)
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
        .select("id, slug, subject, body, body_html, is_enabled, wa_enabled")
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
        .select("sender_name, reply_to_email, brand_color, email_logo_url")
        .eq("organization_id", orgId)
        .single();

      // Fetch org name + address + maps url + slug
      const { data: org } = await supabase
        .from("organizations")
        .select("name, slug, address, google_maps_url")
        .eq("id", orgId)
        .single();

      // Check if patient portal is enabled for deep links
      const { data: portalSettings } = await supabase
        .from("booking_settings")
        .select("portal_enabled")
        .eq("organization_id", orgId)
        .single();

      // Fetch clinic phone
      const { data: clinicPhoneVar } = await supabase
        .from("global_variables")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "clinic_phone")
        .single();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app";
      const portalEnabled = portalSettings?.portal_enabled && org?.slug;
      const portalBaseUrl = portalEnabled ? `${appUrl}/portal/${org.slug}` : "";

      const fromName = emailSettings?.sender_name || org?.name || "Yenda";
      const replyTo = emailSettings?.reply_to_email || undefined;
      const brandColor = emailSettings?.brand_color || "#10b981";
      const logoUrl = emailSettings?.email_logo_url || null;
      const clinicName = org?.name || emailSettings?.sender_name || "Yenda";

      // Check if WhatsApp is configured for this org
      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("id, access_token, waba_id, phone_number_id, is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .maybeSingle();

      // Find the approved WA template linked to this reminder template
      let waTemplate: WhatsAppTemplate | null = null;
      let waClient: WhatsAppClient | null = null;

      if (waConfig?.access_token && waConfig?.waba_id && waConfig?.phone_number_id && template) {
        if (template.wa_enabled) {
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
              accessToken: decrypt(waConfig.access_token),
              wabaId: waConfig.waba_id,
              phoneNumberId: waConfig.phone_number_id,
            });
          }
        }
      }

      for (const appt of orgAppointments) {
        const patient = appt.patients as any;
        const patientEmail = patient?.email || null;

        // Shared variables — computed once and used by BOTH channels, so a
        // patient without an email can still receive the WhatsApp reminder.
        const doctor = appt.doctors as any;
        const office = appt.offices as any;
        // `send_reminders` aún no está en types/database.ts (no se puede
        // regenerar sin la migración aplicada) — cast local (mig 228).
        const service = appt.services as {
          name?: string;
          base_price?: number | null;
          pre_appointment_instructions?: string | null;
          send_reminders?: boolean;
        } | null;

        // Opt-out por servicio (mig 228): con send_reminders=false la cita
        // no recibe recordatorios automáticos por NINGÚN canal (email ni
        // WhatsApp), en ambas ventanas (24h y 2h). Citas sin servicio
        // (service null) mantienen el comportamiento anterior (default true).
        if (service && service.send_reminders === false) {
          skipped++;
          for (const channel of ["email", "whatsapp"] as const) {
            const alreadySent =
              channel === "email"
                ? emailAlreadySent.has(appt.id)
                : waAlreadySent.has(appt.id);
            if (alreadySent) continue;
            await supabase.from("reminder_logs").upsert(
              {
                appointment_id: appt.id,
                template_slug: window.slug,
                channel,
                recipient: "none",
                status: "skipped",
                error_message: "Servicio con recordatorios desactivados (send_reminders=false)",
              },
              { onConflict: "appointment_id,template_slug,channel" }
            );
          }
          continue;
        }

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

        // Compute appointment amount. price_snapshot guarda el bruto (mig 100):
        // el recordatorio debe mostrar el precio post-descuento que pagará el
        // paciente.
        const grossAmount =
          (appt as any).price_snapshot ??
          service?.base_price ??
          null;
        const rawAmount =
          grossAmount != null && !isNaN(Number(grossAmount))
            ? Math.max(0, Number(grossAmount) - (Number((appt as any).discount_amount) || 0))
            : null;
        const montoCita = rawAmount != null ? `S/. ${rawAmount.toFixed(2)}` : "";

        // ── EMAIL CHANNEL (independent) ──────────────────────────────────
        // Only touch email if this reminder hasn't already gone out by email.
        if (!emailAlreadySent.has(appt.id)) {
          if (!patientEmail) {
            // No email on file — skip ONLY the email channel and fall
            // through to WhatsApp below (do NOT `continue`).
            skipped++;
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
          } else {
            const variables: Record<string, string> = {
              "{{paciente_nombre}}": patientName || "",
              "{{doctor_nombre}}": doctor?.full_name || "",
              "{{fecha_cita}}": formattedDate,
              "{{hora_cita}}": appt.start_time?.slice(0, 5) || "",
              "{{consultorio}}": office?.name || "",
              "{{servicio}}": service?.name || "",
              "{{clinica_nombre}}": clinicName,
              "{{clinica_telefono}}": clinicPhoneVar?.value || "",
              "{{direccion_clinica}}": org?.address || "",
              "{{link_ubicacion}}": org?.google_maps_url || "",
              "{{instrucciones_servicio}}": service?.pre_appointment_instructions || "",
              "{{monto_cita}}": montoCita,
              "{{link_cancelar}}": portalBaseUrl ? `${portalBaseUrl}/mis-citas` : "",
              "{{link_reagendar}}": portalBaseUrl ? `${portalBaseUrl}/mis-citas` : "",
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

            const html = buildEmailHtml({
              body: emailBody,
              bodyHtml: emailBodyHtml,
              brandColor,
              logoUrl,
              clinicName,
            });

            const emailResult = await sendEmail({
              to: patientEmail,
              subject,
              html,
              fromName,
              replyTo,
            });

            if (emailResult.ok) {
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
            } else {
              const errorMsg = emailResult.skipped ? "email_not_configured" : emailResult.error;
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
          }
        }

        // ── WHATSAPP CHANNEL (independent) ───────────────────────────────
        // Fires regardless of the email outcome above, and is retried in
        // future runs until it succeeds (its own per-channel "sent" set).
        if (waClient && waTemplate && !waAlreadySent.has(appt.id)) {
          const recipientPhone = patient?.phone || appt.patient_phone;
          if (recipientPhone) {
            {
              try {
                const waVariableData: Record<string, string> = {
                  paciente_nombre: patientName || "",
                  fecha_cita: formattedDate,
                  hora_cita: appt.start_time?.slice(0, 5) || "",
                  servicio: service?.name || "",
                  doctor_nombre: doctor?.full_name || "",
                  clinica_nombre: clinicName,
                  clinica_telefono: clinicPhoneVar?.value || "",
                  // Sin esto, una plantilla de recordatorio con {{monto_pagado}}
                  // caería al fallback "-" (mismo bug que la 1ª confirmación real).
                  monto_pagado: rawAmount != null ? `S/ ${rawAmount.toFixed(2)}` : "",
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

    }

    results.push({ slug: window.slug, sent, skipped, failed });
  }

  console.log("[Cron Reminders] Completed:", JSON.stringify(results));
  await finishCronRun(supabase, runId, true, { results });

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
