import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { emailLimiter } from "@/lib/rate-limit";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

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
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rl.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  const body = await req.json();
  const {
    to,
    subject,
    body: emailBody,
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

  // If Resend is not configured, return an error
  if (!resend) {
    return NextResponse.json(
      {
        error:
          "RESEND_API_KEY no está configurada. Agrega la variable de entorno para enviar correos.",
      },
      { status: 503 }
    );
  }

  // Send real email via Resend
  const fromAddress = clinic_name
    ? `${clinic_name} <onboarding@resend.dev>`
    : "VibeForge <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: [to],
    subject,
    html,
  });

  if (error) {
    return NextResponse.json(
      { error: `Error al enviar: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    messageId: data?.id,
  });
}
