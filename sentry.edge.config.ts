import * as Sentry from "@sentry/nextjs";

// Ver sentry.server.config.ts: la integración de Vercel solo crea la
// NEXT_PUBLIC_; SENTRY_DSN es override manual.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Ver sentry.server.config.ts: explícito por la promesa de privacidad.
    sendDefaultPii: false,
  });
}
