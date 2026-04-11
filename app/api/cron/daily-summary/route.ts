import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEmailHtml } from "@/lib/email-template";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/daily-summary
 *
 * Vercel Cron job that runs once per day (morning).
 * For each org that has team_daily_summary enabled AND has notification_emails set,
 * sends a daily summary of today's appointments to the team.
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

  // 2. Check SMTP config
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ skipped: true, reason: "smtp_not_configured" });
  }

  const supabase = createAdminClient();

  // 3. Find orgs with enabled team_daily_summary template AND configured notification_emails
  const { data: templates } = await supabase
    .from("email_templates")
    .select("id, organization_id, subject, body, is_enabled")
    .eq("slug", "team_daily_summary")
    .eq("is_enabled", true);

  if (!templates || templates.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_enabled_templates" });
  }

  // Build today's date in Peru timezone (UTC-5)
  const now = new Date();
  const peruOffset = -5 * 60; // minutes
  const peruNow = new Date(now.getTime() + (peruOffset - now.getTimezoneOffset()) * 60000);
  const todayStr = peruNow.toISOString().slice(0, 10);

  const formattedToday = new Date(todayStr + "T12:00:00").toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const results: Array<{ org_id: string; sent: number; error?: string }> = [];

  for (const template of templates) {
    const orgId = template.organization_id;

    // Fetch email settings incl. notification_emails
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("sender_name, reply_to_email, brand_color, email_logo_url, notification_emails")
      .eq("organization_id", orgId)
      .single();

    const notificationEmails = emailSettings?.notification_emails?.trim();
    if (!notificationEmails) {
      results.push({ org_id: orgId, sent: 0, error: "no_notification_emails" });
      continue;
    }

    // Parse comma-separated list
    const recipients = notificationEmails
      .split(/[,;]/)
      .map((e: string) => e.trim())
      .filter((e: string) => e.includes("@"));

    if (recipients.length === 0) {
      results.push({ org_id: orgId, sent: 0, error: "invalid_emails" });
      continue;
    }

    // Fetch org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const clinicName = org?.name || emailSettings?.sender_name || "VibeForge";

    // Fetch today's appointments for this org
    const { data: appointments } = await supabase
      .from("appointments")
      .select(
        `
        id, patient_name, start_time, end_time, status,
        doctors ( full_name ),
        offices ( name ),
        services ( name )
        `
      )
      .eq("organization_id", orgId)
      .eq("appointment_date", todayStr)
      .in("status", ["scheduled", "confirmed"])
      .order("start_time");

    const totalAppts = appointments?.length || 0;

    // Build appointment list HTML
    let appointmentsListHtml = "";
    if (totalAppts === 0) {
      appointmentsListHtml = `<p style="color: #6b7280; font-style: italic;">No hay citas programadas para hoy.</p>`;
    } else {
      const rows = (appointments || [])
        .map((a: Record<string, unknown>) => {
          const startTime = typeof a.start_time === "string" ? a.start_time.slice(0, 5) : "";
          const endTime = typeof a.end_time === "string" ? a.end_time.slice(0, 5) : "";
          const doctor = (a.doctors as { full_name?: string } | null)?.full_name || "—";
          const office = (a.offices as { name?: string } | null)?.name || "—";
          const service = (a.services as { name?: string } | null)?.name || "—";
          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; font-weight: 600; color: #059669; white-space: nowrap;">${startTime}–${endTime}</td>
              <td style="padding: 8px 12px;">${a.patient_name || ""}</td>
              <td style="padding: 8px 12px; color: #555;">${doctor}</td>
              <td style="padding: 8px 12px; color: #555;">${service}</td>
              <td style="padding: 8px 12px; color: #6b7280; font-size: 12px;">${office}</td>
            </tr>`;
        })
        .join("");

      appointmentsListHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Hora</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Paciente</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Doctor</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Servicio</th>
              <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Consultorio</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // Render template variables
    const variables: Record<string, string> = {
      "{{fecha_cita}}": formattedToday,
      "{{clinica_nombre}}": clinicName,
      "{{total_citas}}": String(totalAppts),
      "{{lista_citas}}": appointmentsListHtml,
    };

    let subject = template.subject;
    let emailBody = template.body;
    for (const [key, value] of Object.entries(variables)) {
      subject = subject.replaceAll(key, value);
      emailBody = emailBody.replaceAll(key, value);
    }

    // Append appointments list after the body (even if template doesn't use {{lista_citas}})
    if (!template.body.includes("{{lista_citas}}")) {
      emailBody = `${emailBody}<br/><br/><strong>Total de citas hoy: ${totalAppts}</strong>${appointmentsListHtml}`;
    }

    const brandColor = emailSettings?.brand_color || "#10b981";
    const logoUrl = emailSettings?.email_logo_url || null;
    const html = buildEmailHtml({ body: emailBody, brandColor, logoUrl, clinicName });

    // Send email to all recipients
    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELFSIGNED !== "true" },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const fromAddress = process.env.SMTP_FROM || smtpUser;
    const fromName = emailSettings?.sender_name || clinicName;
    const replyTo = emailSettings?.reply_to_email || undefined;

    try {
      await transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        replyTo,
        to: recipients.join(", "),
        subject,
        html,
      });
      results.push({ org_id: orgId, sent: recipients.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron Daily Summary] Error sending to org ${orgId}:`, msg);
      results.push({ org_id: orgId, sent: 0, error: msg });
    }
  }

  const totalSent = results.reduce((sum, r) => sum + r.sent, 0);

  return NextResponse.json({
    success: true,
    date: todayStr,
    orgs_processed: results.length,
    total_emails_sent: totalSent,
    results,
  });
}
