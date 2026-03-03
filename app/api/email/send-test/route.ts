import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
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

  // Check SMTP configuration
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json(
      {
        error:
          "SMTP no configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS en las variables de entorno.",
      },
      { status: 503 }
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

  // Send email via SMTP
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort) || 587,
    secure: Number(smtpPort) === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const fromAddress = process.env.SMTP_FROM || smtpUser;
  const fromName = clinic_name || "VibeForge";

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromAddress}>`,
      to,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error al enviar: ${message}` },
      { status: 500 }
    );
  }
}
