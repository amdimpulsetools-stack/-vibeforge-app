import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, isEmailConfigured } from "@/lib/resend";
import { buildEmailHtml } from "@/lib/email-template";
import { WhatsAppClient } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, resolveVariableValues } from "@/lib/whatsapp/send";
import { decrypt } from "@/lib/encryption";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";
import type { ContactEvent } from "@/types/fertility";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/fertility-followup-contact
 *
 * Vercel Cron — runs hourly. Per-org schedule check (`auto_contact_time`,
 * default 08:00 in America/Lima) so we cover all TZs from a single
 * hourly schedule.
 *
 * Logic per spec sec. 5.1:
 *  1. For each org with fertility_basic|fertility_premium enabled.
 *  2. If current local time < auto_contact_time → skip.
 *  3. Find pendientes con expected_by <= NOW() y first_contact_at NULL,
 *     source='rule'.
 *  4. Per followup:
 *     - rule must be active; cap intentos
 *     - try email + whatsapp; record events
 *     - first_contact_at = NOW() solo si al menos un canal entregó
 *     - si todo falla y attempt_count >= max_attempts → desistido_silencioso
 *
 * Idempotency:
 *  - first_contact_at IS NULL filter previene duplicados a quienes ya
 *    fueron contactados con éxito.
 *  - Para los que aún están NULL (todos los canales fallaron), llevamos
 *    una guarda de 12h vía contact_events: si el último intento auto
 *    fue hace < 12h, skip esta iteración (Vercel puede reintentar el
 *    cron y no queremos spam).
 */

const RETRY_GUARD_HOURS = 12;
const DEFAULT_AUTO_CONTACT_TIME_MIN = 8 * 60; // 08:00 Lima default
const LIMA_OFFSET_MIN = -5 * 60; // America/Lima is UTC-5 (no DST)

interface FollowupRow {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  rule_key: string | null;
  attempt_count: number;
  max_attempts: number;
  contact_events: unknown;
  first_contact_at: string | null;
  expected_by: string | null;
  reason: string | null;
}

interface RuleRow {
  id: string;
  rule_key: string;
  is_active: boolean;
  whatsapp_template_id: string | null;
  email_template_key: string | null;
  max_attempts: number;
}

interface PatientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface DoctorRow {
  id: string;
  full_name: string | null;
}

interface OrgRow {
  id: string;
  name: string | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32 || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  let orgsProcessed = 0;
  let followupsProcessed = 0;
  let sentEmail = 0;
  let sentWhatsapp = 0;
  let skipped = 0;
  let failed = 0;
  let closedAsAbandoned = 0;

  // 1) Orgs with fertility addon enabled.
  const { data: activeOrgAddons, error: orgsErr } = await supabase
    .from("organization_addons")
    .select("organization_id, addon_key, settings")
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .eq("enabled", true);

  if (orgsErr) {
    return NextResponse.json({ error: orgsErr.message }, { status: 500 });
  }

  const orgIds = Array.from(
    new Set((activeOrgAddons ?? []).map((r) => r.organization_id))
  );

  if (orgIds.length === 0) {
    return NextResponse.json({
      ok: true,
      orgs_processed: 0,
      followups_processed: 0,
      sent_email: 0,
      sent_whatsapp: 0,
      skipped: 0,
      failed: 0,
    });
  }

  // Default settings map per-org.
  const settingsByOrg = new Map<string, Record<string, unknown>>();
  for (const row of activeOrgAddons ?? []) {
    const s = (row.settings ?? {}) as Record<string, unknown>;
    settingsByOrg.set(row.organization_id, s);
  }

  for (const orgId of orgIds) {
    // 2) Check auto_contact_time gate (per-org local time).
    // Settings shape (best-effort): { auto_contact_time: "08:00", default_message_tone: "amable", auto_send_email: true, auto_send_whatsapp: true }
    const orgSettings = settingsByOrg.get(orgId) ?? {};
    const autoContactTime =
      typeof orgSettings.auto_contact_time === "string"
        ? (orgSettings.auto_contact_time as string)
        : "08:00";
    const sendEmailEnabled = orgSettings.auto_send_email !== false;
    const sendWaEnabled = orgSettings.auto_send_whatsapp !== false;
    const tone =
      typeof orgSettings.default_message_tone === "string"
        ? (orgSettings.default_message_tone as string)
        : "amable";

    const minutesIntoLimaDay = computeLimaDayMinutes(now);
    const targetMinutes = parseHHMM(autoContactTime, DEFAULT_AUTO_CONTACT_TIME_MIN);
    if (minutesIntoLimaDay < targetMinutes) {
      continue;
    }

    orgsProcessed++;

    // 3) Followups due.
    const nowIso = now.toISOString();
    const { data: followups } = await supabase
      .from("clinical_followups")
      .select(
        "id, organization_id, patient_id, doctor_id, rule_key, attempt_count, max_attempts, contact_events, first_contact_at, expected_by, reason"
      )
      .eq("organization_id", orgId)
      .eq("status", "pendiente")
      .eq("source", "rule")
      .is("first_contact_at", null)
      .not("expected_by", "is", null)
      .lte("expected_by", nowIso);

    if (!followups || followups.length === 0) continue;

    // 4) Cargar reglas per-org en cache.
    const ruleKeys = Array.from(
      new Set((followups as FollowupRow[]).map((f) => f.rule_key).filter(Boolean) as string[])
    );

    const rulesByKey = new Map<string, RuleRow>();
    if (ruleKeys.length > 0) {
      const { data: rules } = await supabase
        .from("followup_rules")
        .select(
          "id, rule_key, is_active, whatsapp_template_id, email_template_key, max_attempts"
        )
        .eq("organization_id", orgId)
        .in("rule_key", ruleKeys);
      for (const r of rules ?? []) {
        rulesByKey.set(r.rule_key, r as RuleRow);
      }
    }

    // 5) Resolver datos compartidos por org (clínica + WA config).
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .single();
    const orgRow = org as OrgRow | null;

    const { data: clinicPhoneVar } = await supabase
      .from("global_variables")
      .select("value")
      .eq("organization_id", orgId)
      .eq("key", "clinic_phone")
      .single();
    const clinicPhone = clinicPhoneVar?.value ?? "";

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("sender_name, reply_to_email, brand_color, email_logo_url")
      .eq("organization_id", orgId)
      .maybeSingle();

    const fromName =
      emailSettings?.sender_name || orgRow?.name || "Yenda";
    const replyTo = emailSettings?.reply_to_email || undefined;
    const brandColor = emailSettings?.brand_color || "#10b981";
    const logoUrl = emailSettings?.email_logo_url || null;
    const clinicName = orgRow?.name || fromName;

    const { data: waConfig } = await supabase
      .from("whatsapp_config")
      .select("access_token, waba_id, phone_number_id, is_active")
      .eq("organization_id", orgId)
      .maybeSingle();

    let waClient: WhatsAppClient | null = null;
    if (
      sendWaEnabled &&
      waConfig?.is_active &&
      waConfig.access_token &&
      waConfig.waba_id &&
      waConfig.phone_number_id
    ) {
      try {
        waClient = new WhatsAppClient({
          accessToken: decrypt(waConfig.access_token),
          wabaId: waConfig.waba_id,
          phoneNumberId: waConfig.phone_number_id,
        });
      } catch {
        waClient = null;
      }
    }

    // Cache de email_templates y whatsapp_templates por id/key.
    const emailTemplateByKey = new Map<
      string,
      { subject: string | null; body: string }
    >();
    const waTemplateById = new Map<string, WhatsAppTemplate>();

    for (const f of followups as FollowupRow[]) {
      followupsProcessed++;

      // Anti-duplicate guard: skip if last auto attempt within RETRY_GUARD_HOURS.
      const events: ContactEvent[] = Array.isArray(f.contact_events)
        ? (f.contact_events as ContactEvent[])
        : [];
      const lastAutoAt = events
        .filter((e) => e.type === "auto_email" || e.type === "auto_whatsapp")
        .map((e) => new Date(e.at).getTime())
        .reduce<number>((max, t) => (t > max ? t : max), 0);
      if (lastAutoAt > 0 && now.getTime() - lastAutoAt < RETRY_GUARD_HOURS * 3600 * 1000) {
        skipped++;
        continue;
      }

      if (!f.rule_key) {
        skipped++;
        continue;
      }
      const rule = rulesByKey.get(f.rule_key);
      if (!rule || !rule.is_active) {
        skipped++;
        continue;
      }

      const cap = f.max_attempts ?? rule.max_attempts ?? 3;
      if ((f.attempt_count ?? 0) >= cap) {
        await supabase
          .from("clinical_followups")
          .update({
            status: "desistido_silencioso",
            closure_reason: "desistido_silencioso",
            closed_at: now.toISOString(),
            is_resolved: true,
            resolved_at: now.toISOString(),
          })
          .eq("id", f.id)
          .eq("organization_id", orgId);
        closedAsAbandoned++;
        continue;
      }

      // Cargar paciente y doctor.
      const { data: patient } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email, phone")
        .eq("id", f.patient_id)
        .eq("organization_id", orgId)
        .single();
      if (!patient) {
        skipped++;
        continue;
      }

      const { data: doctor } = await supabase
        .from("doctors")
        .select("id, full_name")
        .eq("id", f.doctor_id)
        .eq("organization_id", orgId)
        .single();

      const newEvents: ContactEvent[] = [];
      let anyChannelDelivered = false;
      let attemptedAny = false;

      const variables: Record<string, string> = {
        "{{paciente_nombre}}": (patient as PatientRow).first_name ?? "",
        "{{paciente_nombre_completo}}": [
          (patient as PatientRow).first_name,
          (patient as PatientRow).last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
        "{{doctor_nombre}}": (doctor as DoctorRow | null)?.full_name ?? "",
        "{{clinica_nombre}}": clinicName,
        "{{clinica_telefono}}": clinicPhone,
        "{{primera_cita_fecha}}": "",
        "{{dias_transcurridos}}": computeDaysSince(f.expected_by),
      };

      // ── Email ─────────────────────────────────────────
      if (sendEmailEnabled && (patient as PatientRow).email && rule.email_template_key) {
        if (isEmailConfigured()) {
          attemptedAny = true;
          let tpl = emailTemplateByKey.get(`${rule.email_template_key}|${tone}`);
          if (!tpl) {
            // Prefer org-specific template; fallback to global.
            const { data: orgTpl } = await supabase
              .from("message_templates")
              .select("subject, body")
              .eq("template_key", rule.email_template_key)
              .eq("channel", "email")
              .eq("tone", tone)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (orgTpl) {
              tpl = orgTpl as { subject: string | null; body: string };
            } else {
              const { data: globalTpl } = await supabase
                .from("message_templates")
                .select("subject, body")
                .eq("template_key", rule.email_template_key)
                .eq("channel", "email")
                .eq("tone", tone)
                .is("organization_id", null)
                .maybeSingle();
              if (globalTpl) {
                tpl = globalTpl as { subject: string | null; body: string };
              }
            }
            if (tpl) emailTemplateByKey.set(`${rule.email_template_key}|${tone}`, tpl);
          }

          if (tpl) {
            let subject = tpl.subject ?? "";
            let bodyText = tpl.body ?? "";
            for (const [k, v] of Object.entries(variables)) {
              subject = subject.replaceAll(k, v);
              bodyText = bodyText.replaceAll(k, v);
            }
            const html = buildEmailHtml({
              body: bodyText,
              bodyHtml: null,
              brandColor,
              logoUrl,
              clinicName,
            });
            const result = await sendEmail({
              to: (patient as PatientRow).email!,
              subject,
              html,
              fromName,
              replyTo,
            });
            if (result.ok) {
              sentEmail++;
              anyChannelDelivered = true;
              newEvents.push({
                type: "auto_email",
                at: new Date().toISOString(),
                by_user_id: null,
                delivery_status: "sent",
                channel: "email",
              });
            } else {
              failed++;
              newEvents.push({
                type: "auto_email",
                at: new Date().toISOString(),
                by_user_id: null,
                delivery_status: result.skipped ? "unknown" : "failed",
                channel: "email",
                error: !result.ok && !result.skipped ? result.error : undefined,
              });
            }
          } else {
            newEvents.push({
              type: "auto_email",
              at: new Date().toISOString(),
              by_user_id: null,
              delivery_status: "skipped_template_missing",
              channel: "email",
            });
          }
        }
      } else if (!(patient as PatientRow).email) {
        newEvents.push({
          type: "auto_email",
          at: new Date().toISOString(),
          by_user_id: null,
          delivery_status: "skipped_no_email",
          channel: "email",
        });
      }

      // ── WhatsApp ──────────────────────────────────────
      if (sendWaEnabled && (patient as PatientRow).phone && rule.whatsapp_template_id) {
        if (waClient) {
          let waTpl = waTemplateById.get(rule.whatsapp_template_id);
          if (!waTpl) {
            const { data: t } = await supabase
              .from("whatsapp_templates")
              .select("*")
              .eq("id", rule.whatsapp_template_id)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (t) {
              waTpl = t as unknown as WhatsAppTemplate;
              waTemplateById.set(rule.whatsapp_template_id, waTpl);
            }
          }

          if (waTpl && waTpl.status === "APPROVED") {
            attemptedAny = true;
            try {
              const variableData: Record<string, string> = {
                paciente_nombre: variables["{{paciente_nombre}}"] ?? "",
                doctor_nombre: variables["{{doctor_nombre}}"] ?? "",
                clinica_nombre: variables["{{clinica_nombre}}"] ?? "",
                clinica_telefono: variables["{{clinica_telefono}}"] ?? "",
              };
              const variableValues = resolveVariableValues(waTpl, variableData);
              const { wamid } = await sendWhatsAppMessage(
                waClient,
                waTpl,
                (patient as PatientRow).phone!,
                variableValues
              );

              await supabase.from("whatsapp_message_logs").insert({
                organization_id: orgId,
                template_id: waTpl.id,
                recipient_phone: (patient as PatientRow).phone,
                patient_id: f.patient_id,
                wamid,
                status: "sent",
              });
              sentWhatsapp++;
              anyChannelDelivered = true;
              newEvents.push({
                type: "auto_whatsapp",
                at: new Date().toISOString(),
                by_user_id: null,
                delivery_status: "sent",
                channel: "whatsapp",
              });
            } catch (waErr) {
              failed++;
              newEvents.push({
                type: "auto_whatsapp",
                at: new Date().toISOString(),
                by_user_id: null,
                delivery_status: "failed",
                channel: "whatsapp",
                error: waErr instanceof Error ? waErr.message : String(waErr),
              });
            }
          } else if (waTpl) {
            newEvents.push({
              type: "auto_whatsapp",
              at: new Date().toISOString(),
              by_user_id: null,
              delivery_status: "skipped_template_not_approved",
              channel: "whatsapp",
            });
          } else {
            newEvents.push({
              type: "auto_whatsapp",
              at: new Date().toISOString(),
              by_user_id: null,
              delivery_status: "skipped_template_missing",
              channel: "whatsapp",
            });
          }
        } else {
          newEvents.push({
            type: "auto_whatsapp",
            at: new Date().toISOString(),
            by_user_id: null,
            delivery_status: "skipped_no_whatsapp_config",
            channel: "whatsapp",
          });
        }
      } else if (!(patient as PatientRow).phone) {
        newEvents.push({
          type: "auto_whatsapp",
          at: new Date().toISOString(),
          by_user_id: null,
          delivery_status: "skipped_no_phone",
          channel: "whatsapp",
        });
      }

      // ── Update followup ───────────────────────────────
      const updatedEvents = [...events, ...newEvents];
      const update: Record<string, unknown> = {
        contact_events: updatedEvents,
      };

      if (attemptedAny) {
        update.attempt_count = (f.attempt_count ?? 0) + 1;
      }

      if (anyChannelDelivered) {
        update.first_contact_at = new Date().toISOString();
        update.last_contacted_at = new Date().toISOString();
        update.status = "contactado";
      } else if (attemptedAny && (f.attempt_count ?? 0) + 1 >= cap) {
        // Todos los canales fallaron en este intento Y llegamos al cap.
        update.status = "desistido_silencioso";
        update.closure_reason = "desistido_silencioso";
        update.closed_at = new Date().toISOString();
        update.is_resolved = true;
        update.resolved_at = new Date().toISOString();
        closedAsAbandoned++;
      }

      await supabase
        .from("clinical_followups")
        .update(update)
        .eq("id", f.id)
        .eq("organization_id", orgId);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    orgs_processed: orgsProcessed,
    followups_processed: followupsProcessed,
    sent_email: sentEmail,
    sent_whatsapp: sentWhatsapp,
    skipped,
    failed,
    closed_as_abandoned: closedAsAbandoned,
  });
}

function computeLimaDayMinutes(now: Date): number {
  const limaMs = now.getTime() + LIMA_OFFSET_MIN * 60 * 1000;
  const lima = new Date(limaMs);
  return lima.getUTCHours() * 60 + lima.getUTCMinutes();
}

function parseHHMM(value: string, fallbackMin: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return fallbackMin;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return fallbackMin;
  return h * 60 + mm;
}

function computeDaysSince(expectedBy: string | null): string {
  if (!expectedBy) return "";
  const ts = new Date(expectedBy).getTime();
  if (isNaN(ts)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ts) / (24 * 3600 * 1000)));
  return String(days);
}
