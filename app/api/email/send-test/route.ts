import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { buildEmailHtml } from "@/lib/email-template";
import { emailLimiter } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rate limit: 3 emails per minute per user
  const rl = emailLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiados correos enviados. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const body = await req.json();
  const {
    to,
    subject,
    body: emailBody,
    from_name,
    from_email,
    reply_to,
    brand_color,
    logo_url,
    clinic_name,
  } = body;

  if (!to || !subject || !emailBody) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: to, subject, body" },
      { status: 400 }
    );
  }

  const html = buildEmailHtml({
    body: emailBody,
    brandColor: brand_color || "#10b981",
    logoUrl: logo_url,
    clinicName: clinic_name,
  });

  try {
    const fromAddress = from_name
      ? `${from_name} <${from_email || process.env.SMTP_FROM || "noreply@vibeforge.app"}>`
      : `VibeForge <${process.env.SMTP_FROM || "noreply@vibeforge.app"}>`;

    const result = await sendEmail({
      to,
      subject,
      html,
      from: fromAddress,
      ...(reply_to ? { replyTo: reply_to } : {}),
    });

    return NextResponse.json({ success: true, id: result.messageId });
  } catch (err: unknown) {
    console.error("Email send error:", err);
    const message =
      err instanceof Error ? err.message : "Error al enviar el correo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
