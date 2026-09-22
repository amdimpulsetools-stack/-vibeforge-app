import * as Sentry from "@sentry/nextjs";

// La integración Sentry↔Vercel solo crea NEXT_PUBLIC_SENTRY_DSN; SENTRY_DSN
// queda como override manual. El DSN es público por diseño, así que leer
// la NEXT_PUBLIC_ en servidor no expone nada.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // App médica: sin cabeceras de usuario ni cuerpos de petición. Default
    // del SDK, explícito porque la política de privacidad lo promete.
    sendDefaultPii: false,
  });
}
