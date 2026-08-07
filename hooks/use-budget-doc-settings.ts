"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";

type BudgetDocFlags = {
  documentsEnabled: boolean;
  singlePricing: boolean;
};

const DEFAULT_FLAGS: BudgetDocFlags = {
  documentsEnabled: true,
  singlePricing: false,
};

// ── Caché a nivel de módulo ─────────────────────────────────────
// Este hook se llama una vez POR TARJETA en /scheduler/budgets (hasta 20 por
// carga, y otra tanda en cada cambio de pestaña), más en el modal de asignar
// presupuesto, el de registro, la sección de la ficha del paciente y dos
// pantallas de admin. Todas esas llamadas pedían exactamente la misma fila de
// `org_budget_pdf_settings`.
//
// Con la caché + deduplicación de peticiones en vuelo, N consumidores montados
// a la vez generan UNA sola query, y las remontadas dentro del TTL no generan
// ninguna. Son flags de configuración que solo cambia el founder, así que 5
// minutos es holgado; un refresh de página vacía la caché igualmente.
const TTL_MS = 5 * 60 * 1000;
const flagsCache = new Map<string, { value: BudgetDocFlags; at: number }>();
const inFlight = new Map<string, Promise<BudgetDocFlags>>();

function getCachedFlags(organizationId: string): BudgetDocFlags | null {
  const hit = flagsCache.get(organizationId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    flagsCache.delete(organizationId);
    return null;
  }
  return hit.value;
}

function loadFlags(organizationId: string): Promise<BudgetDocFlags> {
  const cached = getCachedFlags(organizationId);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(organizationId);
  if (pending) return pending;

  const request = (async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("org_budget_pdf_settings")
      .select("documents_enabled, pricing_mode")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const row = data as {
      documents_enabled: boolean | null;
      pricing_mode: string | null;
    } | null;
    const value: BudgetDocFlags = {
      documentsEnabled: row?.documents_enabled ?? true,
      singlePricing: row?.pricing_mode === "single",
    };
    flagsCache.set(organizationId, { value, at: Date.now() });
    return value;
  })().finally(() => {
    inFlight.delete(organizationId);
  });

  inFlight.set(organizationId, request);
  return request;
}

/**
 * Flags de presentación del sistema de presupuestos (mig 181), leídos
 * de `org_budget_pdf_settings` con RLS de miembro:
 *
 * - `documentsEnabled` — false = modo "solo asignación y seguimiento":
 *   la UI oculta generar/descargar/enviar PDF (la org emite su
 *   documento fuera de Yenda). Seteado por el founder.
 * - `singlePricing` — pricing_mode='single': la UI colapsa los tiers
 *   A/B/C a una sola tarjeta de precio (por debajo se sigue
 *   escribiendo tier='A').
 *
 * Fila ausente = defaults (documentos on, tiers) — igual que el
 * generador (`loadPdfSettings` en lib/budget-pdf/generate.tsx).
 * Mientras `loading` es true se devuelven los defaults, así las
 * superficies no parpadean escondiendo botones ya visibles.
 */
export function useBudgetDocSettings(): {
  documentsEnabled: boolean;
  singlePricing: boolean;
  loading: boolean;
} {
  const { organizationId } = useOrganization();
  // Si la caché ya está caliente arrancamos con el valor real y sin estado de
  // carga: mismo resultado visual que antes, sin el roundtrip.
  const [state, setState] = useState(() => {
    const cached = organizationId ? getCachedFlags(organizationId) : null;
    return cached
      ? { ...cached, loading: false }
      : { ...DEFAULT_FLAGS, loading: true };
  });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const cached = getCachedFlags(organizationId);
    if (cached) {
      setState({ ...cached, loading: false });
      return;
    }

    setState((prev) => (prev.loading ? prev : { ...prev, loading: true }));
    loadFlags(organizationId).then((value) => {
      if (cancelled) return;
      setState({ ...value, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}
