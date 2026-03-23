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
  { key: "SMTP_HOST", feature: "Email notifications" },
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
}
