import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { buildEmailHtml } from "@/lib/email-template";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
    const { data, error } = await resend.emails.send({
      from: from_name
        ? `${from_name} <${from_email || "onboarding@resend.dev"}>`
        : `VibeForge <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
      ...(reply_to ? { replyTo: reply_to } : {}),
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: unknown) {
    console.error("Email send error:", err);
    const message =
      err instanceof Error ? err.message : "Error al enviar el correo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
