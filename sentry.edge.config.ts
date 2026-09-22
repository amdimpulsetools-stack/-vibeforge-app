import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Ver sentry.server.config.ts: explícito por la promesa de privacidad.
    sendDefaultPii: false,
  });
}
