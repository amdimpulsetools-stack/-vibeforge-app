import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

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
  const { to, subject, html, from_name, from_email, reply_to } = body;

  if (!to || !subject || !html) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: to, subject, html" },
      { status: 400 }
    );
  }

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
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Error al enviar el correo" },
      { status: 500 }
    );
  }
}
