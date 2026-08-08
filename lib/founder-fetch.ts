"use client";

/**
 * Fetch para las páginas del founder panel. Tres garantías que antes no
 * existían (auditoría 2026-08-08):
 *
 *  1. Si el API devuelve FOUNDER_2FA_MISSING (sesión 2FA expirada a mitad de
 *     uso), redirige a la pantalla de verificación en vez de dejar que la
 *     página procese el error como si fueran datos (Owners reventaba con
 *     TypeError; Organizations/Users/Revenue mostraban ceros falsos).
 *  2. Nunca devuelve el body de un error como datos: lanza FounderFetchError.
 *  3. El caller distingue "cargando" de "error" con un solo try/catch.
 */

export class FounderFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function founderFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    if (body.code === "FOUNDER_2FA_MISSING") {
      window.location.href = "/founder-dashboard?verify=true";
      // La navegación está en curso; dejamos al caller en estado "cargando".
      return new Promise<T>(() => {});
    }
    throw new FounderFetchError(res.status, body.error ?? `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}
