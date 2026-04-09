export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables on server start
    const { validateEnv } = await import("./lib/env-validation");
    validateEnv();

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = (...args: unknown[]) => {
  // Dynamic import to avoid errors when Sentry is not configured
  import("@sentry/nextjs").then((Sentry) => {
    if (typeof Sentry.captureRequestError === "function") {
      // @ts-expect-error -- spread args for Sentry request error handler
      Sentry.captureRequestError(...args);
    }
  });
};
