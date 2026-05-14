import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// "New device login detected" — sent ONCE when a user
// authenticates on a device we haven't seen before. Powers the
// "if it wasn't you, lock everything down" defense in the
// credential-leak scenario.
//
// Triggered from /api/auth/session/register when registerSession
// returns outcome="created" (i.e. brand new device).
// ============================================================

interface SendNewDeviceArgs {
  userId: string;
  deviceLabel: string;
  ipCity: string | null;
  ipCountry: string | null;
  loggedAt: Date;
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "https://yenda.app";

export async function sendNewDeviceEmail(
  args: SendNewDeviceArgs,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  // Resend not configured (local dev / staging) — silent skip.
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true };
  }

  const admin = createAdminClient();

  // Need email + display name. user_profiles.email is populated
  // by handle_new_user (mig 098) for every signup, so we read
  // from there to avoid an auth.admin.getUserById round trip.
  const { data: profile } = await admin
    .from("user_profiles")
    .select("email, full_name")
    .eq("id", args.userId)
    .maybeSingle();

  const email = profile?.email as string | null | undefined;
  if (!email) return { ok: false, error: "no_recipient" };

  const greeting = profile?.full_name?.toString().split(" ")[0] ?? "Hola";

  // Location string with graceful fallback when Vercel geo
  // headers aren't available (non-Vercel hosting, local dev).
  const location =
    [args.ipCity, args.ipCountry].filter(Boolean).join(", ") ||
    "Ubicación desconocida";

  const formattedDate = args.loggedAt.toLocaleString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });

  const devicesUrl = `${APP_URL}/account/devices`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Nuevo inicio de sesión</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      ${greeting}, detectamos un inicio de sesión en tu cuenta de Yenda desde un dispositivo nuevo.
    </p>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">📱 Dispositivo</div>
      <div style="font-size:14px;color:#111827;font-weight:600;margin-bottom:12px;">${escapeHtml(args.deviceLabel)}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">📍 Ubicación</div>
      <div style="font-size:14px;color:#111827;font-weight:600;margin-bottom:12px;">${escapeHtml(location)}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">🕐 Fecha</div>
      <div style="font-size:14px;color:#111827;font-weight:600;">${escapeHtml(formattedDate)}</div>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Si fuiste vos, podés ignorar este mensaje.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
      Si <strong>no reconocés</strong> este inicio de sesión, alguien puede haber accedido a tu cuenta. Cerrá todas las sesiones desde tus dispositivos:
    </p>
    <p style="margin:0 0 24px;">
      <a href="${devicesUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
        Revisar mis dispositivos
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Este email se envía automáticamente cada vez que detectamos un dispositivo nuevo en tu cuenta. No respondas a esta dirección.
    </p>
  `;

  const html = buildEmailHtml({
    body,
    brandColor: "#10b981",
    logoUrl: null,
    clinicName: "Yenda",
  });

  const result = await sendEmail({
    to: email,
    subject: "Nuevo inicio de sesión en tu cuenta de Yenda",
    html,
    fromName: "Yenda",
    tags: [{ name: "kind", value: "new_device" }],
  });

  return result;
}

// Minimal HTML escaper — we control the input (device label, location,
// formatted date) so the surface area is small, but the safety belt
// is cheap.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
