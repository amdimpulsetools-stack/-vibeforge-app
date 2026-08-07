"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * Wrapper ligero del manejador de invitaciones.
 *
 * PERF (Lote 2 / 2.10): el manejador real (invite-token-handler-inner.tsx)
 * importa supabase-js, y este componente se monta en el root layout — o sea,
 * en TODAS las rutas, incluidas landing/login/blog. Para no meter supabase-js
 * (~54 kB gz) en el First Load público, aquí solo se mira el hash de la URL
 * (sin dependencias) y se hace import() dinámico del componente real
 * únicamente si llega un token de invitación (`#...type=invite`, ver inner).
 * El inner vuelve a leer el hash al montar, así que el flujo es idéntico.
 */
export function InviteTokenHandler() {
  const [Handler, setHandler] = useState<ComponentType | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("type=invite")) return;

    let cancelled = false;
    import("./invite-token-handler-inner").then((m) => {
      if (!cancelled) setHandler(() => m.InviteTokenHandlerInner);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Handler) return null;
  return <Handler />;
}
