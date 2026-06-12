import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

// ============================================================
// Budget PDF — patient email
//
// Triggered by /api/budgets/[id]/send when the obstetra chooses
// channel="email". Subject and body come from the per-org template
// `fertility_budget_to_patient` (mig 173, editable in Settings →
// Correos → Fertilidad); if the org disabled or lost the row we
// fall back to the built-in copy so the channel never breaks.
//
// Two parts are appended in code and are NOT editable:
//   - the "Ver mi presupuesto" button with the signed PDF URL
//   - the confidentiality note
// Attachments are not used: signed URLs travel cleaner through
// corporate mail filters than PDF attachments, and the link expires
// after the configured window (default 7 days) which is a built-in
// privacy boundary for fertility data.
// ============================================================

const TEMPLATE_SLUG = "fertility_budget_to_patient";

// Mirrors the seed in mig 173 — used when the org's row is missing
// or disabled.
const DEFAULT_SUBJECT = "Tu presupuesto de {{tratamiento}} — {{clinica_nombre}}";
const DEFAULT_BODY =
  "Hola {{paciente_nombre}},\n\n" +
  "Te compartimos el presupuesto del tratamiento {{tratamiento}} que conversamos en consulta. " +
  "Puedes revisarlo desde el botón que aparece más abajo.\n\n" +
  "El presupuesto tiene una vigencia de {{vigencia_dias}} días desde la fecha de emisión. " +
  "Si tienes cualquier consulta antes de tomar una decisión, no dudes en contactarnos al {{clinica_telefono}} — estamos para ayudarte.\n\n" +
  "Un abrazo,\nEquipo de {{clinica_nombre}}";

interface SendBudgetEmailArgs {
  organizationId: string;
  /** Where the email goes. */
  patientEmail: string;
  /** First name for {{paciente_nombre}}. */
  patientFirstName: string | null;
  /** Treatment label (e.g. "Fecundación in Vitro (FIV)"). */
  treatmentLabel: string;
  /** Signed URL to the budget PDF — must be long-lived (≥7 days). */
  pdfSignedUrl: string;
  /** Vigencia in days, surfaced in the body. */
  vigencyDays: number;
}

export async function sendBudgetEmailToPatient(
  admin: SupabaseClient,
  args: SendBudgetEmailArgs,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true };
  }

  // Org identity + email branding. Same sources as the fertility
  // followup cron: email_settings drives sender/brand, organizations
  // gives the display name, global_variables the phone.
  const [{ data: org }, { data: emailSettings }, { data: phoneVar }, { data: tpl }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("name, legal_name, icon_url, logo_url")
        .eq("id", args.organizationId)
        .maybeSingle(),
      admin
        .from("email_settings")
        .select("sender_name, reply_to_email, brand_color, email_logo_url")
        .eq("organization_id", args.organizationId)
        .maybeSingle(),
      admin
        .from("global_variables")
        .select("value")
        .eq("organization_id", args.organizationId)
        .eq("key", "clinic_phone")
        .maybeSingle(),
      admin
        .from("email_templates")
        .select("subject, body, is_enabled")
        .eq("organization_id", args.organizationId)
        .eq("slug", TEMPLATE_SLUG)
        .maybeSingle(),
    ]);

  const clinicName =
    (org?.legal_name as string | null) ??
    (org?.name as string | null) ??
    "Tu clínica";
  const fromName =
    (emailSettings?.sender_name as string | null) || clinicName;
  const replyTo = (emailSettings?.reply_to_email as string | null) || undefined;
  const brandColor = sanitizeBrandColor(
    (emailSettings?.brand_color as string | null) || "#10b981",
  );
  const logoUrl =
    ((emailSettings?.email_logo_url as string | null) ??
      (org?.icon_url as string | null) ??
      (org?.logo_url as string | null)) ||
    null;
  const clinicPhone = (phoneVar?.value as string | null) ?? "";

  // Disabled template = "don't use my custom version", not "block the
  // channel" — the send is an explicit staff action, so we fall back.
  const useCustom = Boolean(tpl && tpl.is_enabled);
  let subject = (useCustom && tpl?.subject) || DEFAULT_SUBJECT;
  let bodyText = (useCustom && tpl?.body) || DEFAULT_BODY;

  const variables: Record<string, string> = {
    "{{paciente_nombre}}": args.patientFirstName ?? "",
    "{{tratamiento}}": args.treatmentLabel,
    "{{clinica_nombre}}": clinicName,
    "{{clinica_telefono}}": clinicPhone,
    "{{vigencia_dias}}": String(args.vigencyDays),
  };
  for (const [k, v] of Object.entries(variables)) {
    subject = subject.replaceAll(k, v);
    bodyText = bodyText.replaceAll(k, v);
  }

  // Editable body (escaped) + fixed button + fixed confidentiality
  // note. The fixed parts live in code so an edit can never drop the
  // PDF link or the compliance footer.
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br/>");
  const trustedBodyHtml = `
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">${bodyHtml}</p>
    <p style="margin:0 0 24px;">
      <a href="${args.pdfSignedUrl}" style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Ver mi presupuesto
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Este email contiene información confidencial dirigida exclusivamente a la paciente. Si lo recibiste por error, por favor elimínalo.
    </p>
  `;

  const html = buildEmailHtml({
    body: "",
    trustedBodyHtml,
    brandColor,
    logoUrl,
    clinicName,
  });

  const result = await sendEmail({
    to: args.patientEmail,
    subject,
    html,
    fromName,
    replyTo,
    tags: [{ name: "kind", value: "budget_to_patient" }],
  });

  return result;
}

function sanitizeBrandColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#10b981";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export so the route can import a constant for the signed URL TTL
// the patient gets — kept here so the email helper and the URL TTL
// stay coupled.
export const PATIENT_PDF_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
