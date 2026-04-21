import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

/**
 * Sends the trial_welcome email to the owner who just started a 14-day trial.
 *
 * This is called server-side from /api/plans/start-trial. It swallows errors
 * internally (logs them) so it never fails the parent request. SMTP config is
 * optional — if missing we skip silently.
 *
 * Required context:
 *   - `supabase`: a server client with RLS applied (user must be member of org)
 *   - `organizationId`: the org starting the trial
 *   - `ownerEmail`: email address of the owner (from auth.users)
 *   - `ownerName`: display name (from user_profiles; falls back to email local part)
 */
export async function sendTrialWelcomeEmail(params: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerEmail: string | null | undefined;
  ownerName: string | null | undefined;
}): Promise<{ success: boolean; reason?: string; error?: string }> {
  const { supabase, organizationId, ownerEmail, ownerName } = params;

  try {
    if (!ownerEmail) {
      return { success: false, reason: "no_owner_email" };
    }

    if (!isEmailConfigured()) {
      return { success: false, reason: "email_not_configured" };
    }

    // Fetch enabled trial_welcome template
    const { data: template } = await supabase
      .from("email_templates")
      .select("subject, body, is_enabled")
      .eq("organization_id", organizationId)
      .eq("slug", "trial_welcome")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!template) {
      return { success: false, reason: "template_disabled_or_missing" };
    }

    // Fetch org name + current trial subscription + email settings
    const [{ data: org }, { data: subscription }, { data: emailSettings }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", organizationId).single(),
      supabase
        .from("organization_subscriptions")
        .select("trial_ends_at, plans(name)")
        .eq("organization_id", organizationId)
        .eq("status", "trialing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("email_settings")
        .select("sender_name, reply_to_email, brand_color, email_logo_url")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    const clinicName = org?.name || emailSettings?.sender_name || "VibeForge";
    const displayName = ownerName || ownerEmail.split("@")[0] || "";
    const planName =
      (subscription as unknown as { plans?: { name?: string } | null })?.plans?.name || "Trial";
    const trialEndsAt = subscription?.trial_ends_at
      ? new Date(subscription.trial_ends_at).toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibeforge.com";
    const dashboardUrl = `${appUrl}/dashboard`;
    const guiaUrl = `${appUrl}/base-conocimientos`;

    const variables: Record<string, string> = {
      "{{owner_nombre}}": displayName,
      "{{clinica_nombre}}": clinicName,
      "{{trial_ends_at}}": trialEndsAt,
      "{{dashboard_url}}": dashboardUrl,
      "{{guia_url}}": guiaUrl,
      "{{plan_nombre}}": planName,
    };

    let subject = template.subject;
    let emailBody = template.body;
    for (const [key, value] of Object.entries(variables)) {
      subject = subject.replaceAll(key, value);
      emailBody = emailBody.replaceAll(key, value);
    }

    const brandColor = emailSettings?.brand_color || "#10b981";
    const logoUrl = emailSettings?.email_logo_url || null;

    const html = buildEmailHtml({
      body: emailBody,
      brandColor,
      logoUrl,
      clinicName,
    });

    const result = await sendEmail({
      to: ownerEmail,
      subject,
      html,
      fromName: emailSettings?.sender_name || clinicName,
      replyTo: emailSettings?.reply_to_email || undefined,
    });

    if (!result.ok) {
      const msg = result.skipped ? "email_not_configured" : result.error;
      console.warn("[sendTrialWelcomeEmail] failed:", msg);
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[sendTrialWelcomeEmail] failed:", msg);
    return { success: false, error: msg };
  }
}
