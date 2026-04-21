import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

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

  // 2. Check email config
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: true, reason: "email_not_configured" });
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

    const result = await sendEmail({
      to: recipients,
      subject,
      html,
      fromName: emailSettings?.sender_name || clinicName,
      replyTo: emailSettings?.reply_to_email || undefined,
    });

    if (result.ok) {
      results.push({ org_id: orgId, sent: recipients.length });
    } else {
      const msg = result.skipped ? "email_not_configured" : result.error;
      console.error(`[Cron Daily Summary] Error sending to org ${orgId}:`, msg);
      results.push({ org_id: orgId, sent: 0, error: msg });
    }
  }

  const totalSent = results.reduce((sum, r) => sum + r.sent, 0);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Marketing emails (birthday + follow-up)
  // ══════════════════════════════════════════════════════════════════
  const marketingResults = {
    birthday_sent: 0,
    followup_sent: 0,
  };

  // Today's month-day for birthday matching (MM-DD)
  const todayMonth = peruNow.getUTCMonth() + 1;
  const todayDay = peruNow.getUTCDate();

  // Build org list from email_templates with marketing templates enabled
  const { data: marketingTemplates } = await supabase
    .from("email_templates")
    .select("organization_id, slug, subject, body")
    .in("slug", ["marketing_birthday", "marketing_followup"])
    .eq("is_enabled", true);

  if (marketingTemplates && marketingTemplates.length > 0) {
    // Group templates by org
    const templatesByOrg = new Map<string, Map<string, { subject: string; body: string }>>();
    for (const tpl of marketingTemplates) {
      if (!templatesByOrg.has(tpl.organization_id)) {
        templatesByOrg.set(tpl.organization_id, new Map());
      }
      templatesByOrg.get(tpl.organization_id)!.set(tpl.slug, {
        subject: tpl.subject,
        body: tpl.body,
      });
    }

    for (const [orgId, orgTemplates] of templatesByOrg) {
      // Fetch org settings
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

      const clinicName = org?.name || emailSettings?.sender_name || "VibeForge";
      const brandColor = emailSettings?.brand_color || "#10b981";
      const logoUrl = emailSettings?.email_logo_url || null;
      const fromName = emailSettings?.sender_name || clinicName;
      const replyTo = emailSettings?.reply_to_email || undefined;

      const renderTemplate = (tpl: { subject: string; body: string }, patientName: string) => {
        const vars: Record<string, string> = {
          "{{paciente_nombre}}": patientName,
          "{{clinica_nombre}}": clinicName,
          "{{clinica_telefono}}": clinicPhoneVar?.value || "",
          "{{direccion_clinica}}": org?.address || "",
          "{{link_ubicacion}}": org?.google_maps_url || "",
        };
        let subject = tpl.subject;
        let body = tpl.body;
        for (const [k, v] of Object.entries(vars)) {
          subject = subject.replaceAll(k, v);
          body = body.replaceAll(k, v);
        }
        return { subject, body };
      };

      // ── BIRTHDAY ──
      const birthdayTpl = orgTemplates.get("marketing_birthday");
      if (birthdayTpl) {
        // Find patients with birthday today (matching month-day)
        const { data: birthdayPatients } = await supabase
          .from("patients")
          .select("id, first_name, last_name, email, birth_date")
          .eq("organization_id", orgId)
          .eq("status", "active")
          .not("email", "is", null)
          .not("birth_date", "is", null);

        const birthdayToday = (birthdayPatients || []).filter((p: { birth_date: string | null }) => {
          if (!p.birth_date) return false;
          const d = new Date(p.birth_date);
          return d.getUTCMonth() + 1 === todayMonth && d.getUTCDate() === todayDay;
        });

        for (const patient of birthdayToday) {
          const patientName = `${patient.first_name} ${patient.last_name}`.trim();
          const { subject, body } = renderTemplate(birthdayTpl, patientName);
          const html = buildEmailHtml({ body, brandColor, logoUrl, clinicName });

          const result = await sendEmail({
            to: patient.email!,
            subject,
            html,
            fromName,
            replyTo,
          });
          if (result.ok) {
            marketingResults.birthday_sent++;
            await supabase.from("marketing_email_logs").insert({
              organization_id: orgId,
              patient_id: patient.id,
              template_slug: "marketing_birthday",
            });
          } else if (!result.skipped) {
            console.error(`[Birthday] Error ${patient.email}:`, result.error);
          }
        }
      }

      // ── FOLLOW-UP (patients who haven't returned in 90+ days) ──
      const followupTpl = orgTemplates.get("marketing_followup");
      if (followupTpl) {
        // Patients whose last appointment was 90+ days ago AND haven't received a follow-up in the last 60 days
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        // Get all active patients with email in this org
        const { data: allPatients } = await supabase
          .from("patients")
          .select("id, first_name, last_name, email")
          .eq("organization_id", orgId)
          .eq("status", "active")
          .not("email", "is", null);

        if (allPatients && allPatients.length > 0) {
          // Batch query: latest appointment per patient in this org
          const patientIds = allPatients.map((p: { id: string }) => p.id);

          // Get latest appointment date per patient
          const { data: lastAppts } = await supabase
            .from("appointments")
            .select("patient_id, appointment_date")
            .in("patient_id", patientIds)
            .eq("organization_id", orgId)
            .eq("status", "completed")
            .order("appointment_date", { ascending: false });

          const lastApptByPatient = new Map<string, string>();
          for (const a of (lastAppts || [])) {
            const apt = a as { patient_id: string | null; appointment_date: string };
            if (apt.patient_id && !lastApptByPatient.has(apt.patient_id)) {
              lastApptByPatient.set(apt.patient_id, apt.appointment_date);
            }
          }

          // Get recent follow-up logs
          const { data: recentLogs } = await supabase
            .from("marketing_email_logs")
            .select("patient_id")
            .eq("organization_id", orgId)
            .eq("template_slug", "marketing_followup")
            .gte("sent_at", sixtyDaysAgo);

          const recentlyContacted = new Set((recentLogs || []).map((l: { patient_id: string }) => l.patient_id));

          // Filter: last appt > 90 days ago AND not contacted in 60 days
          const toFollowUp = allPatients.filter((p: { id: string }) => {
            const lastDate = lastApptByPatient.get(p.id);
            if (!lastDate) return false; // Never had a completed appointment
            if (lastDate >= ninetyDaysAgo) return false; // Recent appt
            if (recentlyContacted.has(p.id)) return false; // Already contacted
            return true;
          });

          // Limit to 20 per day per org to avoid spam looking
          const toSend = toFollowUp.slice(0, 20);

          for (const patient of toSend) {
            const patientName = `${patient.first_name} ${patient.last_name}`.trim();
            const { subject, body } = renderTemplate(followupTpl, patientName);
            const html = buildEmailHtml({ body, brandColor, logoUrl, clinicName });

            const result = await sendEmail({
              to: (patient as { email: string }).email,
              subject,
              html,
              fromName,
              replyTo,
            });
            if (result.ok) {
              marketingResults.followup_sent++;
              await supabase.from("marketing_email_logs").insert({
                organization_id: orgId,
                patient_id: patient.id,
                template_slug: "marketing_followup",
              });
            } else if (!result.skipped) {
              console.error(`[Followup] Error:`, result.error);
            }
          }
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    date: todayStr,
    orgs_processed: results.length,
    total_emails_sent: totalSent,
    marketing: marketingResults,
    results,
  });
}
