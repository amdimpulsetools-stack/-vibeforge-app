/**
 * Validates required environment variables at startup.
 * Throws an error if any required variable is missing.
 * Call this in instrumentation.ts so it runs once on server start.
 */

const REQUIRED_SERVER_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const REQUIRED_FOR_FEATURES: { key: string; feature: string }[] = [
  { key: "ANTHROPIC_API_KEY", feature: "AI Assistant" },
  { key: "RESEND_API_KEY", feature: "Email notifications" },
  { key: "EMAIL_FROM", feature: "Email notifications (sender address)" },
  { key: "MP_ACCESS_TOKEN", feature: "MercadoPago payments" },
];

export function validateEnv() {
  const missing: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n\nAdd them to .env.local or your hosting provider's environment settings.`
    );
  }

  // Warn about optional but important vars
  for (const { key, feature } of REQUIRED_FOR_FEATURES) {
    if (!process.env[key]) {
      console.warn(`[env] ${key} not set — ${feature} will be disabled`);
    }
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn(
      "[env] NEXT_PUBLIC_APP_URL not set — falling back to http://localhost:3000. Set this in production!"
    );
  }

  // ── MercadoPago: fail fast if TEST credentials are deployed to
  //    production. MP test tokens start with "TEST-" and silently
  //    accept payments that never settle. Catching this at boot is
  //    way better than discovering it on a real customer's failed
  //    checkout. We also require MP_WEBHOOK_SECRET in production
  //    when MP_ACCESS_TOKEN is set — without it, signature
  //    verification falls back to "warn and accept", which is
  //    spoof-able.
  if (process.env.NODE_ENV === "production") {
    const mpToken = process.env.MP_ACCESS_TOKEN ?? "";
    if (mpToken.startsWith("TEST-")) {
      throw new Error(
        "MP_ACCESS_TOKEN uses TEST- prefix in production. " +
          "Refusing to start — replace it with the production access token " +
          "from MercadoPago dashboard before deploying.",
      );
    }
    if (mpToken && !process.env.MP_WEBHOOK_SECRET) {
      throw new Error(
        "MP_ACCESS_TOKEN is set in production but MP_WEBHOOK_SECRET is missing. " +
          "Without the secret, MP webhooks cannot be signature-verified — " +
          "set MP_WEBHOOK_SECRET to the value from the MercadoPago dashboard.",
      );
    }
  }
}
