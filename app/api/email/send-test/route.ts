import { NextRequest, NextResponse } from "next/server";
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
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
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

  if (!subject || !emailBody) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: subject, body" },
      { status: 400 }
    );
  }

  const html = buildEmailHtml({
    body: emailBody,
    brandColor: brand_color || "#10b981",
    logoUrl: logo_url,
    clinicName: clinic_name,
  });

  // Return HTML preview — actual sending uses Supabase native emails
  return NextResponse.json({
    success: true,
    preview: true,
    html,
  });
}
