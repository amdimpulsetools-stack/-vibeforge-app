import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });

  // Session Replay pesa ~38 kB gz y con replaysSessionSampleRate: 0 solo se
  // usa cuando ocurre un error. Lo sacamos del bundle inicial de las 265
  // páginas y lo añadimos como integración en cuanto el navegador está
  // ocioso. El import dinámico se resuelve contra nuestro propio origen, así
  // que no choca con el CSP `script-src 'self'` (lib/supabase/middleware.ts).
  // NO usar Sentry.lazyLoadIntegration(): esa vía carga desde el CDN de
  // Sentry y el CSP la bloquea.
  const loadReplay = () => {
    import("@sentry/nextjs")
      .then((S) => {
        Sentry.addIntegration(S.replayIntegration());
      })
      .catch(() => {
        // Si el chunk no carga, la app sigue funcionando sin replay.
      });
  };

  if (typeof window !== "undefined") {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(loadReplay, { timeout: 5000 });
    } else {
      setTimeout(loadReplay, 2000);
    }
  }
}
