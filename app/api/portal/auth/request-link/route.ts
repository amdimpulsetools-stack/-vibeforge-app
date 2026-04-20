import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateToken } from "@/lib/portal-auth";
import { buildEmailHtml } from "@/lib/email-template";
import { rateLimit } from "@/lib/rate-limit";
import nodemailer from "nodemailer";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  slug: z.string().min(1),
});

const linkLimiter = rateLimit({ max: 3, windowMs: 60 * 1000 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = linkLimiter(`portal-link:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en unos minutos." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, slug } = parsed.data;
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!org) {
    return NextResponse.json({ success: true });
  }

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("portal_enabled")
    .eq("organization_id", org.id)
    .single();

  if (!settings?.portal_enabled) {
    return NextResponse.json({ success: true });
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  await supabase.from("patient_portal_tokens").insert({
    organization_id: org.id,
    email: email.toLowerCase().trim(),
    token,
    expires_at: expiresAt.toISOString(),
  });

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    const origin =
      req.headers.get("origin") ||
      `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;
    const verifyUrl = `${origin}/portal/${slug}/verify?token=${token}`;

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("sender_name, brand_color, email_logo_url")
      .eq("organization_id", org.id)
      .single();

    const html = buildEmailHtml({
      body: `Hola,\n\nHaz clic en el siguiente enlace para acceder a tu portal de paciente en ${org.name}:\n\n${verifyUrl}\n\nEste enlace expira en 15 minutos.\n\nSi no solicitaste este acceso, puedes ignorar este correo.`,
      brandColor: emailSettings?.brand_color || "#10b981",
      logoUrl: emailSettings?.email_logo_url || null,
      clinicName: org.name,
      footerText: `${org.name} · Portal del Paciente`,
    });

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPass },
      socketTimeout: 15000,
    });

    transporter
      .sendMail({
        from: `"${emailSettings?.sender_name || org.name}" <${smtpUser}>`,
        to: email,
        subject: `Tu acceso al portal — ${org.name}`,
        html,
      })
      .catch((err) =>
        console.error("[Portal] Magic link email error:", err)
      );
  }

  return NextResponse.json({ success: true });
}
