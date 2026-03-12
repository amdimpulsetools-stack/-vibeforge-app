"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-display font-semibold">
          Error en esta sección
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Algo falló al cargar esta página. Puedes reintentar o volver al
          dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Ir al dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-muted-foreground">
            Ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
