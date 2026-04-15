/**
 * Generates a professional HTML email layout.
 * Uses inline styles for maximum email client compatibility.
 */

import { sanitizeEmailHtml } from "@/lib/sanitize-email-html";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeBrandColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#10b981";
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {
    // invalid URL
  }
  return "";
}

export function buildEmailHtml({
  body,
  bodyHtml,
  brandColor = "#10b981",
  logoUrl,
  clinicName,
  footerText,
}: {
  /** Plain-text body. Used when `bodyHtml` is not provided. */
  body: string;
  /**
   * Optional pre-rendered HTML body (from the rich-text editor). When
   * present, takes precedence. Sanitized again here server-side as a
   * defense-in-depth measure — even if the client was bypassed, the only
   * HTML that reaches the email is what the allow-list permits.
   */
  bodyHtml?: string | null;
  brandColor?: string;
  logoUrl?: string | null;
  clinicName?: string | null;
  footerText?: string | null;
}): string {
  const year = new Date().getFullYear();
  const safeBrandColor = sanitizeBrandColor(brandColor);
  const safeClinicName = clinicName ? escapeHtml(clinicName) : "";
  const safeFooterText = footerText ? escapeHtml(footerText) : "";
  const safeLogoUrl = logoUrl ? sanitizeUrl(logoUrl) : "";
  const safeBody = bodyHtml
    ? sanitizeEmailHtml(bodyHtml)
    : escapeHtml(body).replace(/\n/g, "<br/>");

  const logoBlock = safeLogoUrl
    ? `<img src="${safeLogoUrl}" alt="${safeClinicName}" style="max-height:48px;max-width:180px;display:block;" />`
    : safeClinicName
    ? `<span style="font-size:20px;font-weight:700;color:#ffffff;">${safeClinicName}</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeClinicName || "VibeForge"}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Inner card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${safeBrandColor};padding:24px 32px;text-align:center;">
              ${logoBlock}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.7;">
              ${safeBody}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.5;">
              ${safeFooterText}
              ${safeClinicName ? `<br/>&copy; ${year} ${safeClinicName}` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
