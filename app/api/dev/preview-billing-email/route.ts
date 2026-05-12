/**
 * Dev-only preview endpoint for billing emails.
 *
 * Renders the HTML of one of the 3 billing templates (payment_failed,
 * grace_ending, access_suspended) with sample data so the founder can
 * visually QA the look + the sender domain WITHOUT triggering a real
 * webhook event or charging anyone.
 *
 * Gated by NODE_ENV !== "production" OR an explicit DEV_PREVIEW_TOKEN
 * env var, so even if it accidentally ships to prod it's not exposed.
 *
 * Usage:
 *   GET /api/dev/preview-billing-email?kind=payment_failed
 *   GET /api/dev/preview-billing-email?kind=grace_ending
 *   GET /api/dev/preview-billing-email?kind=access_suspended
 *
 * Optional query overrides:
 *   ?org_name=Vitra  &plan_name=Centro%20Médico  &amount=S%2F+349
 *   &grace_until=15%2F05%2F2026
 *
 * The "from" address shown in the preview reflects EMAIL_FROM env var so
 * you can confirm it's `noreply@yenda.app` (or whatever you set).
 */

import { NextResponse } from "next/server";
import { buildEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";

const KINDS = ["payment_failed", "grace_ending", "access_suspended"] as const;
type Kind = (typeof KINDS)[number];

function renderTemplate(
  kind: Kind,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const replace = (s: string): string => {
    let out = s;
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(k, v);
    return out;
  };

  if (kind === "payment_failed") {
    return {
      subject: replace("No pudimos procesar tu pago — actualiza tu tarjeta"),
      body: replace(
        `Hola {{org_name}},

Intentamos cobrar tu suscripción {{plan_name}} ({{amount}}) y el pago no fue procesado. Esto suele pasar cuando la tarjeta venció, tiene fondos insuficientes o tu banco rechazó la transacción.

Tu acceso a Yenda sigue activo por ahora. Tienes hasta el {{grace_until}} (7 días de gracia) para actualizar tu método de pago. Después de esa fecha el acceso será suspendido.

Para actualizar tu tarjeta entra a: {{billing_url}}

Si necesitas ayuda escríbenos a {{support_email}}.

— Equipo Yenda`,
      ),
    };
  }

  if (kind === "grace_ending") {
    return {
      subject: replace("Tu período de gracia termina en 2 días"),
      body: replace(
        `Hola {{org_name}},

Te escribimos para recordarte que el pago de tu suscripción {{plan_name}} sigue pendiente. Tu período de gracia termina el {{grace_until}}.

Si no actualizas tu método de pago antes de esa fecha, el acceso a Yenda quedará suspendido. Tus datos NO se borran — el acceso se restablece apenas el pago se procese.

Actualiza tu tarjeta aquí: {{billing_url}}

¿Problemas con el pago? Escríbenos a {{support_email}} y te ayudamos.

— Equipo Yenda`,
      ),
    };
  }

  return {
    subject: replace("Tu acceso a Yenda fue suspendido"),
    body: replace(
      `Hola {{org_name}},

Tu acceso a Yenda fue suspendido por pago pendiente de la suscripción {{plan_name}} ({{amount}}).

Tus datos NO se borran. Apenas actualices tu método de pago y se procese el cobro, el acceso se restablece automáticamente.

Reactiva tu cuenta en: {{billing_url}}

Si necesitas ayuda escríbenos a {{support_email}}.

— Equipo Yenda`,
    ),
  };
}

export async function GET(request: Request) {
  // Gate: only dev or with an explicit token. NEVER expose in prod
  // without authentication.
  const isProduction = process.env.NODE_ENV === "production";
  const devToken = process.env.DEV_PREVIEW_TOKEN;
  const url = new URL(request.url);
  const passedToken = url.searchParams.get("token");

  if (isProduction && (!devToken || passedToken !== devToken)) {
    return NextResponse.json(
      {
        error:
          "This endpoint is dev-only. Set DEV_PREVIEW_TOKEN env var and pass ?token= in production.",
      },
      { status: 403 },
    );
  }

  const kindParam = url.searchParams.get("kind") ?? "payment_failed";
  if (!KINDS.includes(kindParam as Kind)) {
    return NextResponse.json(
      { error: `Invalid kind. Must be one of: ${KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  const kind = kindParam as Kind;

  // Sample data — overridable via query params for testing edge cases.
  const orgName = url.searchParams.get("org_name") ?? "Clínica Vitra S.A.C.";
  const planName = url.searchParams.get("plan_name") ?? "Centro Médico";
  const amount = url.searchParams.get("amount") ?? "S/ 349.00";
  const graceUntil =
    url.searchParams.get("grace_until") ??
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  const billingUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://yenda.app";
  const supportEmail = process.env.SUPPORT_EMAIL ?? "soporte@yenda.app";

  const vars: Record<string, string> = {
    "{{org_name}}": orgName,
    "{{plan_name}}": planName,
    "{{amount}}": amount,
    "{{grace_until}}": graceUntil,
    "{{billing_url}}": `${billingUrl}/account`,
    "{{support_email}}": supportEmail,
  };

  const { subject, body } = renderTemplate(kind, vars);

  // The actual email HTML the recipient would see (uses the same
  // wrapper as the real send path).
  const innerHtml = buildEmailHtml({
    body,
    clinicName: "Yenda",
    brandColor: "#10b981",
  });

  const fromAddress = process.env.EMAIL_FROM ?? "(EMAIL_FROM env var not set)";

  // Wrapped in a debug shell so the founder sees metadata + preview side
  // by side.
  const debugShell = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Preview: ${kind}</title>
<style>
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; background: #f3f4f6; }
  .meta { background: #1f2937; color: #f9fafb; padding: 20px 24px; }
  .meta h1 { margin: 0 0 12px; font-size: 16px; }
  .meta .field { display: flex; gap: 12px; font-size: 13px; margin: 4px 0; }
  .meta .field label { width: 100px; color: #9ca3af; }
  .meta .field span { font-family: ui-monospace, monospace; color: #e5e7eb; }
  .meta a { color: #34d399; text-decoration: none; margin-right: 16px; font-size: 13px; }
  .meta a:hover { text-decoration: underline; }
  .preview-wrap { padding: 32px; background: #f3f4f6; min-height: calc(100vh - 120px); }
  .preview-frame { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .preview-frame iframe { width: 100%; min-height: 800px; border: 0; display: block; }
</style>
</head>
<body>
<div class="meta">
  <h1>📧 Email Preview — ${kind}</h1>
  <div class="field"><label>From:</label><span>${escapeHtml(fromAddress)}</span></div>
  <div class="field"><label>To:</label><span>(simulated) ${escapeHtml(orgName)} owner</span></div>
  <div class="field"><label>Subject:</label><span>${escapeHtml(subject)}</span></div>
  <div class="field"><label>Variables:</label><span>org_name=${escapeHtml(orgName)} · plan=${escapeHtml(planName)} · amount=${escapeHtml(amount)}${kind !== "access_suspended" ? ` · grace_until=${escapeHtml(graceUntil)}` : ""}</span></div>
  <div style="margin-top: 12px; display: flex; gap: 4px; flex-wrap: wrap;">
    <strong style="color:#9ca3af; font-size: 12px; margin-right: 8px;">Ver otros:</strong>
    ${KINDS.filter((k) => k !== kind)
      .map(
        (k) =>
          `<a href="?kind=${k}${passedToken ? `&token=${passedToken}` : ""}">${k}</a>`,
      )
      .join("")}
  </div>
</div>
<div class="preview-wrap">
  <div class="preview-frame">
    <iframe srcdoc="${escapeHtmlAttr(innerHtml)}" sandbox="allow-same-origin"></iframe>
  </div>
</div>
</body>
</html>`;

  return new NextResponse(debugShell, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
