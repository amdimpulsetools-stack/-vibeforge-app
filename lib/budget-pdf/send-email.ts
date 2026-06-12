import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

// ============================================================
// Budget PDF — patient email
//
// Triggered by /api/budgets/[id]/send when the obstetra chooses
// channel="email". Sends a friendly note + button linking to the
// signed PDF URL. Attachments are not used: signed URLs travel
// cleaner through corporate mail filters than PDF attachments,
// and the link expires after the configured window (default 7
// days) which is a built-in privacy boundary for fertility data.
// ============================================================

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "https://yenda.app";

interface SendBudgetEmailArgs {
  /** Where the email goes. */
  patientEmail: string;
  /** First name preferred; "Hola" if missing. */
  patientGreeting: string;
  /** Display name of the clinic (e.g. "NATURVITRA S.A.C."). */
  clinicName: string;
  /** Clinic icon for the email header (square logo URL, optional). */
  clinicLogoUrl: string | null;
  /** Optional accent color from the org. Falls back to Yenda emerald. */
  brandColor?: string;
  /** Treatment label (e.g. "Fecundación in Vitro (FIV)") for the subject. */
  treatmentLabel: string;
  /** Signed URL to the budget PDF — must be long-lived (≥7 days). */
  pdfSignedUrl: string;
  /** Vigencia in days, surfaced in the body. */
  vigencyDays: number;
}

export async function sendBudgetEmailToPatient(
  args: SendBudgetEmailArgs,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true };
  }

  const subject = `Tu presupuesto · ${args.treatmentLabel} · ${args.clinicName}`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(args.patientGreeting)},</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Te compartimos el presupuesto del tratamiento <strong>${escapeHtml(args.treatmentLabel)}</strong> que conversamos en consulta. Podés revisarlo desde el siguiente botón:
    </p>
    <p style="margin:0 0 24px;">
      <a href="${args.pdfSignedUrl}" style="display:inline-block;background:${args.brandColor ?? "#10b981"};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Ver mi presupuesto
      </a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      El presupuesto tiene una vigencia de <strong>${args.vigencyDays} días</strong> desde la fecha de emisión. Si tenés cualquier consulta antes de tomar una decisión, no dudes en contactarnos — estamos para ayudarte.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
      Un abrazo,<br>
      <strong>${escapeHtml(args.clinicName)}</strong>
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Este email contiene información confidencial dirigida exclusivamente a la paciente. Si lo recibiste por error, por favor eliminálo.
    </p>
  `;

  const html = buildEmailHtml({
    body: "",
    trustedBodyHtml: body,
    brandColor: args.brandColor ?? "#10b981",
    logoUrl: args.clinicLogoUrl,
    clinicName: args.clinicName,
  });

  const result = await sendEmail({
    to: args.patientEmail,
    subject,
    html,
    fromName: args.clinicName,
    tags: [{ name: "kind", value: "budget_to_patient" }],
  });

  return result;
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
