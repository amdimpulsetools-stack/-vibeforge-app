import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // App médica: sin cabeceras de usuario ni cuerpos de petición. Default
    // del SDK, explícito porque la política de privacidad lo promete.
    sendDefaultPii: false,
  });
}
