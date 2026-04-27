import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { emailLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { sendTestEmailSchema } from "@/lib/validations/api";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
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

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email no configurado. Agrega RESEND_API_KEY y EMAIL_FROM en las variables de entorno.",
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
    body_html,
    brand_color,
    logo_url,
    clinic_name,
  } = parsed.data;

  const html = buildEmailHtml({
    body: emailBody,
    bodyHtml: body_html || null,
    brandColor: brand_color || "#10b981",
    logoUrl: logo_url,
    clinicName: clinic_name,
  });

  const result = await sendEmail({
    to,
    subject,
    html,
    fromName: clinic_name || "Yenda",
  });

  if (!result.ok) {
    const error = result.skipped ? "Email no configurado" : result.error;
    console.error("[send-test] error:", error);
    return NextResponse.json({ error: `Error enviando email: ${error}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageId: result.id });
}
