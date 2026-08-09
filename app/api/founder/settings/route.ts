import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";
import { parseBody } from "@/lib/api-utils";
import { resolveFounderEmail } from "@/lib/support-emails";
import { sendEmail } from "@/lib/resend";
import { buildEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";

/**
 * Ajustes de alertas del founder (mig 205).
 *
 * GET  → ajustes actuales + el destinatario EFECTIVO ya resuelto y de dónde
 *        sale, para que el founder vea a dónde llegan sus correos sin tener
 *        que deducirlo; incluye si el envío está configurado en el entorno.
 * POST → guarda destinatario y toggles.
 * PUT  → envía un correo de prueba al destinatario efectivo.
 */

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  const [{ data: settings }, { data: founderProfile }] = await Promise.all([
    admin
      .from("founder_settings")
      .select(
        "alert_email, notify_new_ticket, notify_new_message, notify_new_org, notify_payment, updated_at",
      )
      .eq("id", true)
      .maybeSingle(),
    admin
      .from("user_profiles")
      .select("email")
      .eq("is_founder", true)
      .not("email", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  const configured = (settings?.alert_email || "").trim();
  const envOverride = (process.env.FOUNDER_ALERT_EMAIL || "").trim();
  const profileEmail = (founderProfile?.email as string | undefined) ?? null;

  const effective = configured || envOverride || profileEmail;
  const source = configured
    ? "settings"
    : envOverride
      ? "env"
      : profileEmail
        ? "profile"
        : "none";

  return NextResponse.json({
    settings: {
      alert_email: settings?.alert_email ?? null,
      notify_new_ticket: settings?.notify_new_ticket ?? true,
      notify_new_message: settings?.notify_new_message ?? true,
      notify_new_org: settings?.notify_new_org ?? true,
      notify_payment: settings?.notify_payment ?? false,
      updated_at: settings?.updated_at ?? null,
    },
    effective_email: effective,
    // De dónde sale el destinatario: lo configurado aquí, la env var, o el
    // perfil founder por defecto.
    source,
    profile_email: profileEmail,
    // Sin estas dos, sendEmail hace `skipped` en silencio y no llega nada.
    delivery_configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
}

const schema = z.object({
  // "" o null = volver al default (email del perfil founder).
  alert_email: z.string().trim().email().or(z.literal("")).nullable(),
  notify_new_ticket: z.boolean(),
  notify_new_message: z.boolean(),
  notify_new_org: z.boolean(),
  notify_payment: z.boolean(),
});

export async function POST(request: Request) {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("founder_settings").upsert({
    id: true,
    alert_email: body.alert_email ? body.alert_email : null,
    notify_new_ticket: body.notify_new_ticket,
    notify_new_message: body.notify_new_message,
    notify_new_org: body.notify_new_org,
    notify_payment: body.notify_payment,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Correo de prueba: la única forma de saber si el envío funciona de verdad. */
export async function PUT() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const to = await resolveFounderEmail(admin);

  if (!to) {
    return NextResponse.json(
      { error: "No hay destinatario configurado ni email en el perfil founder." },
      { status: 400 },
    );
  }

  const result = await sendEmail({
    to,
    subject: "[Yenda] Correo de prueba de alertas",
    html: buildEmailHtml({
      body: `Si estás leyendo esto, las alertas del founder funcionan.

Este correo se envió desde Ajustes del Founder Panel para confirmar que la
entrega está bien configurada. A esta dirección llegarán los avisos de
tickets de soporte y organizaciones nuevas.

— Yenda`,
      brandColor: "#f59e0b",
      logoUrl: null,
      clinicName: "Yenda · Alertas",
    }),
    fromName: "Yenda",
    tags: [{ name: "founder_alert", value: "test" }],
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.skipped
          ? "El envío de correos no está configurado en el entorno (faltan RESEND_API_KEY o EMAIL_FROM)."
          : result.error,
        to,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, to });
}
