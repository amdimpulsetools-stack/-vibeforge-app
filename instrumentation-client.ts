import * as Sentry from "@sentry/nextjs";

// Sin este hook el SDK no instrumenta las navegaciones del App Router: un
// error que ocurre al cambiar de página se queda sin la traza de a qué ruta
// se iba. El build lo pedía con un "ACTION REQUIRED" en cada compilación.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Sin tracing de navegador: nadie consume esos spans y cuestan ~25-35 kB
    // gz en el bundle compartido. El tracing de server/edge sigue activo en
    // sus configs. Reactivable añadiendo tracesSampleRate aquí.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // App médica: NUNCA la cabecera con datos del usuario ni el cuerpo de
    // las peticiones. Es el default del SDK, pero va explícito porque la
    // política de privacidad publicada promete "scrubbing de datos
    // sensibles" y una promesa no debe depender de un default que el SDK
    // pueda cambiar en una versión mayor.
    sendDefaultPii: false,
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
        // Enmascarado EXPLÍCITO por el mismo motivo que sendDefaultPii: la
        // pantalla que se graba es la historia clínica de una paciente. Con
        // esto la grabación conserva la forma de la interfaz (dónde hizo
        // clic, qué se rompió) y ni un solo texto, valor de campo o imagen.
        Sentry.addIntegration(
          S.replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
          }),
        );
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
