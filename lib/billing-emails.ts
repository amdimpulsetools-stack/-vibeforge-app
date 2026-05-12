/**
 * Transactional emails for the billing lifecycle.
 *
 * Three templates (all in Spanish):
 *   1. paymentFailed       — webhook on first `payment.rejected`
 *   2. graceEnding         — cron, 2 days before grace_period_until
 *   3. accessSuspended     — cron, when grace → past_due
 *
 * All three reuse `buildEmailHtml` for the wrapper (same style as
 * the trial-welcome email and fertility followups) and `sendEmail`
 * for delivery. Variables: {{org_name}}, {{plan_name}}, {{amount}},
 * {{grace_until}}, {{billing_url}}, {{support_email}}.
 *
 * Each helper logs a `billing_events` row with event_type='email_sent'
 * so we can audit deliverability after launch.
 *
 * Callers never crash because email failed: we swallow errors and
 * return `{ ok, skipped?, error? }` like the existing trial-welcome
 * helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

export type BillingEmailKind =
  | "payment_failed"
  | "grace_ending"
  | "access_suspended"
  | "account_deletion_requested"
  | "account_deletion_completed"
  | "refund_issued";

export interface BillingEmailContext {
  supabase: SupabaseClient;
  organizationId: string;
  subscriptionId: string | null;
  toEmail: string;
  orgName: string;
  planName: string;
  amount: string; // pre-formatted, e.g. "S/ 349.00"
  graceUntil: string | null; // pre-formatted date "DD/MM/AAAA"
}

interface BillingEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.yenda.app";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "soporte@yenda.app";
const BILLING_URL = `${APP_URL}/account`;

function formatCurrencyPEN(value: number | null | undefined): string {
  if (typeof value !== "number" || isNaN(value)) return "S/ —";
  return `S/ ${value.toFixed(2)}`;
}

function formatDateEsPE(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Builds the per-template content (subject + body text) given the
 * resolved variables. Kept in one place so the three call-sites
 * share the same copy and we can change wording without touching
 * the wiring.
 */
function renderTemplate(
  kind: BillingEmailKind,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const replace = (s: string): string => {
    let out = s;
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(k, v);
    return out;
  };

  if (kind === "payment_failed") {
    return {
      subject: replace("No pudimos procesar tu pago — actualiza tu tarjeta"),
      body: replace(
        `Hola {{org_name}},

Intentamos cobrar tu suscripción {{plan_name}} ({{amount}}) y el pago no fue procesado. Esto suele pasar cuando la tarjeta venció, tiene fondos insuficientes o tu banco rechazó la transacción.

Tu acceso a Yenda sigue activo por ahora. Tienes hasta el {{grace_until}} (7 días de gracia) para actualizar tu método de pago. Después de esa fecha el acceso será suspendido.

Para actualizar tu tarjeta entra a: {{billing_url}}

Si necesitas ayuda escríbenos a {{support_email}}.

— Equipo Yenda`,
      ),
    };
  }

  if (kind === "grace_ending") {
    return {
      subject: replace("Tu período de gracia termina en 2 días"),
      body: replace(
        `Hola {{org_name}},

Te escribimos para recordarte que el pago de tu suscripción {{plan_name}} sigue pendiente. Tu período de gracia termina el {{grace_until}}.

Si no actualizas tu método de pago antes de esa fecha, el acceso a Yenda quedará suspendido. Tus datos NO se borran — el acceso se restablece apenas el pago se procese.

Actualiza tu tarjeta aquí: {{billing_url}}

¿Problemas con el pago? Escríbenos a {{support_email}} y te ayudamos.

— Equipo Yenda`,
      ),
    };
  }

  if (kind === "account_deletion_requested") {
    return {
      subject: replace("Solicitud de eliminación recibida — 30 días para revertir"),
      body: replace(
        `Hola {{org_name}},

Recibimos tu solicitud para eliminar tu clínica de Yenda. Lamentamos verte partir.

Tienes hasta el {{grace_until}} (30 días) para cambiar de opinión. Durante este período tu clínica sigue marcada para eliminación pero los datos NO se han tocado todavía. Si quieres revertirlo, entra a {{billing_url}} y haz clic en "Cancelar eliminación".

Después del {{grace_until}}:
• Los datos personales de pacientes, doctores y miembros serán anonimizados de forma IRREVERSIBLE (nombres, teléfonos, DNI, correos)
• Las facturas se conservan anónimas por 5 años (requisito SUNAT)
• Las historias clínicas se conservan anónimas por 15 años (NTS 139)

¿Cambiaste de opinión o tienes dudas? Escríbenos a {{support_email}}.

— Equipo Yenda`,
      ),
    };
  }

  if (kind === "refund_issued") {
    return {
      subject: replace("Reembolso procesado — {{amount}}"),
      body: replace(
        `Hola {{org_name}},

Procesamos el reembolso de tu pago: {{amount}}. Mercado Pago lo devolverá al método de pago original.

¿Cuándo verás el dinero? Depende del medio de pago:
• Tarjeta de crédito: 5 a 10 días hábiles
• Tarjeta de débito o billetera: 1 a 3 días hábiles

Si pasados esos plazos no ves el reembolso, contáctanos a {{support_email}} y te ayudamos a verificar con Mercado Pago.

— Equipo Yenda`,
      ),
    };
  }

  if (kind === "account_deletion_completed") {
    return {
      subject: replace("Tu clínica ha sido eliminada de Yenda"),
      body: replace(
        `Hola,

El proceso de eliminación de tu clínica se completó. Los datos personales (nombres, teléfonos, correos, DNI) fueron reemplazados por identificadores anónimos de forma IRREVERSIBLE.

Qué se conservó (por ley):
• Facturas electrónicas: anónimas, por 5 años (SUNAT)
• Historias clínicas: anónimas, por 15 años (Ley General de Salud)

Tu cuenta de usuario sigue siendo tuya. Si formas parte de otra clínica en Yenda, tu acceso a esa clínica no fue afectado. Si quieres abrir una nueva clínica más adelante, puedes hacerlo con el mismo correo.

¿Dudas? Escríbenos a {{support_email}}.

— Equipo Yenda`,
      ),
    };
  }

  // access_suspended
  return {
    subject: replace("Tu acceso a Yenda fue suspendido"),
    body: replace(
      `Hola {{org_name}},

Tu suscripción {{plan_name}} fue suspendida porque no se pudo procesar el pago durante el período de gracia.

Importante: tus datos NO fueron borrados. Pacientes, citas, historias clínicas y configuraciones siguen guardados. Apenas regularices el pago, recuperas el acceso completo de inmediato.

Para reactivar tu cuenta actualiza tu método de pago en: {{billing_url}}

Si crees que esto es un error o necesitas ayuda, escríbenos a {{support_email}}.

— Equipo Yenda`,
    ),
  };
}

/**
 * Internal: send + log to billing_events. Used by all 3 helpers.
 */
async function sendBillingEmail(
  ctx: BillingEmailContext,
  kind: BillingEmailKind,
): Promise<BillingEmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true };
  }
  if (!ctx.toEmail) {
    return { ok: false, error: "no_recipient" };
  }

  const vars: Record<string, string> = {
    "{{org_name}}": ctx.orgName,
    "{{plan_name}}": ctx.planName,
    "{{amount}}": ctx.amount,
    "{{grace_until}}": ctx.graceUntil ?? "",
    "{{billing_url}}": BILLING_URL,
    "{{support_email}}": SUPPORT_EMAIL,
  };

  const { subject, body } = renderTemplate(kind, vars);

  // Pull brand colour + logo from email_settings if present so the
  // mail matches the org's transactional style.
  const { data: emailSettings } = await ctx.supabase
    .from("email_settings")
    .select("sender_name, reply_to_email, brand_color, email_logo_url")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  const html = buildEmailHtml({
    body,
    brandColor: emailSettings?.brand_color || "#10b981",
    logoUrl: emailSettings?.email_logo_url || null,
    clinicName: ctx.orgName,
  });

  try {
    const result = await sendEmail({
      to: ctx.toEmail,
      subject,
      html,
      fromName: "Yenda",
      replyTo: emailSettings?.reply_to_email || SUPPORT_EMAIL,
      tags: [{ name: "billing_kind", value: kind }],
    });

    // Audit log (best-effort).
    await ctx.supabase.from("billing_events").insert({
      organization_id: ctx.organizationId,
      subscription_id: ctx.subscriptionId,
      event_type: "email_sent",
      metadata: {
        kind,
        to: ctx.toEmail,
        delivery_status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        error: !result.ok && !result.skipped ? result.error : null,
      },
    });

    if (!result.ok) {
      return result.skipped
        ? { ok: false, skipped: true }
        : { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[billing-emails:${kind}] failed:`, msg);
    return { ok: false, error: msg };
  }
}

export async function sendPaymentFailedEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "payment_failed");
}

export async function sendGraceEndingEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "grace_ending");
}

export async function sendAccessSuspendedEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "access_suspended");
}

export async function sendAccountDeletionRequestedEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "account_deletion_requested");
}

export async function sendAccountDeletionCompletedEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "account_deletion_completed");
}

export async function sendRefundIssuedEmail(
  ctx: BillingEmailContext,
): Promise<BillingEmailResult> {
  return sendBillingEmail(ctx, "refund_issued");
}

/**
 * Resolves the org's owner email + display data needed to fill the
 * email templates. Returns null if the subscription or org owner
 * cannot be found — caller should skip silently in that case.
 *
 * Used by both the webhook and the cron so they don't duplicate
 * the same 4-query lookup.
 */
export async function resolveBillingEmailContext(
  supabase: SupabaseClient,
  organizationId: string,
  subscriptionId: string | null,
): Promise<BillingEmailContext | null> {
  // Subscription + plan + grace window.
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select(
      "id, mp_payer_email, grace_period_until, plans(name, price_monthly)",
    )
    .eq("id", subscriptionId ?? "")
    .maybeSingle();

  // Org name.
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  // Owner email (fallback when mp_payer_email is null — early
  // subscriptions sometimes don't have it persisted).
  let toEmail = sub?.mp_payer_email || "";
  if (!toEmail) {
    const { data: owner } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (owner?.user_id) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", owner.user_id)
        .maybeSingle();
      toEmail = (profile?.email as string | undefined) ?? "";
    }
  }

  if (!toEmail || !org) return null;

  const plan = (sub as unknown as { plans?: { name?: string; price_monthly?: number } | null })
    ?.plans;

  return {
    supabase,
    organizationId,
    subscriptionId: subscriptionId,
    toEmail,
    orgName: org.name ?? "tu clínica",
    planName: plan?.name ?? "Suscripción",
    amount: formatCurrencyPEN(plan?.price_monthly ?? null),
    graceUntil: formatDateEsPE(sub?.grace_period_until ?? null),
  };
}
