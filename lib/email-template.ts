/**
 * Generates a professional HTML email layout.
 * Uses inline styles for maximum email client compatibility.
 */
export function buildEmailHtml({
  body,
  brandColor = "#10b981",
  logoUrl,
  clinicName,
  footerText,
}: {
  body: string;
  brandColor?: string;
  logoUrl?: string | null;
  clinicName?: string | null;
  footerText?: string | null;
}): string {
  const year = new Date().getFullYear();

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${clinicName || ""}" style="max-height:48px;max-width:180px;display:block;" />`
    : clinicName
    ? `<span style="font-size:20px;font-weight:700;color:#ffffff;">${clinicName}</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${clinicName || "VibeForge"}</title>
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
            <td style="background-color:${brandColor};padding:24px 32px;text-align:center;">
              ${logoBlock}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.7;">
              ${body.replace(/\n/g, "<br/>")}
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
              ${footerText || ""}
              ${clinicName ? `<br/>&copy; ${year} ${clinicName}` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
