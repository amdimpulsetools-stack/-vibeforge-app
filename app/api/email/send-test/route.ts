import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { emailLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { sendTestEmailSchema } from "@/lib/validations/api";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

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

  const parsed = await parseBody(req, sendTestEmailSchema);
  if (parsed.error) return parsed.error;
  const {
    to,
    subject,
    body: emailBody,
    brand_color,
    logo_url,
    clinic_name,
  } = parsed.data;

  try {
    const html = buildEmailHtml({
      body: emailBody,
      brandColor: brand_color || "#10b981",
      logoUrl: logo_url,
      clinicName: clinic_name,
    });

    const port = Number(smtpPort) || 587;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELFSIGNED !== "true" },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const fromAddress = process.env.SMTP_FROM || smtpUser;
    const fromName = clinic_name || "VibeForge";

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
    console.error("[SMTP Error]", message);
    return NextResponse.json(
      { error: `Error SMTP: ${message}` },
      { status: 500 }
    );
  }
}
