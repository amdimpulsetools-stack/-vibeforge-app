"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
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
    <html lang="es" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d0f1a",
          color: "#e5e5ef",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center", padding: "1.5rem" }}>
          <div
            style={{
              fontSize: "3.5rem",
              fontWeight: 700,
              color: "#e54545",
              marginBottom: "1rem",
            }}
          >
            Error crítico
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            La aplicación no pudo cargarse
          </h1>
          <p style={{ color: "#8888a0", marginBottom: "2rem" }}>
            Ocurrió un error grave. Por favor, recarga la página.
          </p>
          <button
            onClick={reset}
            style={{
              backgroundColor: "#2dd4a8",
              color: "#0d1a1a",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Recargar página
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#8888a0" }}>
              ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
