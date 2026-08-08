/**
 * Emails del circuito de soporte.
 *
 * Antes de esto (auditoría 2026-08-08) el soporte era un agujero negro: la
 * clínica escribía, la conversación se guardaba en la base y NADIE se
 * enteraba — un ticket real de LuisClinic estuvo 67 días sin respuesta. Aquí
 * viven los tres avisos que cierran el circuito:
 *
 *   1. notifyFounderNewTicket  — al founder cuando una clínica abre un ticket
 *   2. notifyFounderNewMessage — al founder cuando la clínica responde
 *   3. notifyOrgSupportReply   — a la clínica cuando el founder responde
 *
 * Best-effort como el resto de emails del sistema: si Resend no está
 * configurado o falla, se devuelve el error pero NUNCA se rompe la acción
 * del usuario (el ticket ya quedó guardado).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "soporte@yenda.app";
const FOUNDER_INBOX_URL = `${APP_URL}/founder-dashboard/support`;

/**
 * Destinatario de las alertas de founder. Se resuelve desde la base
 * (user_profiles.is_founder) para no depender de una variable de entorno
 * que nadie recuerde configurar; FOUNDER_ALERT_EMAIL la puede sobreescribir.
 */
export async function resolveFounderEmail(
  admin: SupabaseClient,
): Promise<string | null> {
  const override = (process.env.FOUNDER_ALERT_EMAIL || "").trim();
  if (override) return override;

  const { data } = await admin
    .from("user_profiles")
    .select("email")
    .eq("is_founder", true)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();

  return (data?.email as string | undefined) ?? null;
}

interface FounderTicketEmailInput {
  admin: SupabaseClient;
  orgName: string;
  authorName: string;
  subject: string;
  body: string;
  ticketId: string;
  /** true = ticket nuevo; false = mensaje en un ticket existente */
  isNew: boolean;
}

export async function notifyFounder(input: FounderTicketEmailInput): Promise<void> {
  const { admin, orgName, authorName, subject, body, ticketId, isNew } = input;
  try {
    const to = await resolveFounderEmail(admin);
    if (!to) return;

    const heading = isNew
      ? `Nuevo ticket de soporte — ${orgName}`
      : `Nueva respuesta en un ticket — ${orgName}`;

    const text = `${isNew ? "Una clínica abrió un ticket de soporte." : "Una clínica respondió en un ticket abierto."}

Clínica: ${orgName}
Escribe: ${authorName}
Asunto: ${subject}

──────────────────────────────
${body}
──────────────────────────────

Responder desde la bandeja de soporte:
${FOUNDER_INBOX_URL}?ticket=${ticketId}

— Yenda (aviso interno)`;

    await sendEmail({
      to,
      subject: `[Soporte] ${heading}`,
      html: buildEmailHtml({
        body: text,
        brandColor: "#f59e0b", // ámbar del founder panel
        logoUrl: null,
        clinicName: "Yenda · Soporte",
      }),
      fromName: "Yenda Soporte",
      replyTo: SUPPORT_EMAIL,
      tags: [{ name: "support_kind", value: isNew ? "new_ticket" : "new_message" }],
    });
  } catch {
    // best-effort: el ticket ya está guardado
  }
}

interface OrgReplyEmailInput {
  admin: SupabaseClient;
  organizationId: string;
  toEmail: string;
  orgName: string;
  subject: string;
  body: string;
}

/** Aviso a la clínica de que soporte respondió su ticket. */
export async function notifyOrgSupportReply(
  input: OrgReplyEmailInput,
): Promise<void> {
  const { admin, organizationId, toEmail, orgName, subject, body } = input;
  try {
    if (!toEmail) return;

    // Branding de la org si lo tiene configurado (mismo criterio que los
    // emails de billing).
    const { data: emailSettings } = await admin
      .from("email_settings")
      .select("brand_color, email_logo_url, reply_to_email")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const text = `Hola ${orgName},

Respondimos tu consulta de soporte "${subject}":

──────────────────────────────
${body}
──────────────────────────────

Puedes seguir la conversación desde Yenda, en la sección Soporte:
${APP_URL}/support

Si necesitas algo más, respóndenos por ahí mismo — estamos atentos.

— Equipo Yenda`;

    await sendEmail({
      to: toEmail,
      subject: `Respondimos tu consulta: ${subject}`,
      html: buildEmailHtml({
        body: text,
        brandColor: emailSettings?.brand_color || "#10b981",
        logoUrl: emailSettings?.email_logo_url || null,
        clinicName: orgName,
      }),
      fromName: "Yenda",
      replyTo: emailSettings?.reply_to_email || SUPPORT_EMAIL,
      tags: [{ name: "support_kind", value: "support_reply" }],
    });
  } catch {
    // best-effort
  }
}

/** Aviso al founder de que se registró una organización nueva. */
export async function notifyFounderNewOrg(
  admin: SupabaseClient,
  orgName: string,
  ownerEmail: string | null,
  ownerName: string | null,
): Promise<void> {
  try {
    const to = await resolveFounderEmail(admin);
    if (!to) return;

    const text = `Se registró una organización nueva en Yenda.

Clínica: ${orgName}
Owner: ${ownerName || "—"} (${ownerEmail || "sin email"})

Verla en el Panel CEO:
${APP_URL}/founder-dashboard/ceo

— Yenda (aviso interno)`;

    await sendEmail({
      to,
      subject: `[Yenda] Nueva organización registrada: ${orgName}`,
      html: buildEmailHtml({
        body: text,
        brandColor: "#f59e0b",
        logoUrl: null,
        clinicName: "Yenda · Alertas",
      }),
      fromName: "Yenda",
      replyTo: SUPPORT_EMAIL,
      tags: [{ name: "founder_alert", value: "new_org" }],
    });
  } catch {
    // best-effort
  }
}
