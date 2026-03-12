"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="mx-auto max-w-md text-center px-6">
        <div className="mb-6 text-6xl font-display font-bold text-destructive">
          Error
        </div>
        <h1 className="mb-2 text-2xl font-display font-semibold">
          Algo salió mal
        </h1>
        <p className="mb-8 text-muted-foreground">
          Ocurrió un error inesperado. Por favor, intenta de nuevo.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            Ir al inicio
          </a>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground">
            ID del error: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
