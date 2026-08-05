"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";

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
  const [state, setState] = useState({
    documentsEnabled: true,
    singlePricing: false,
    loading: true,
  });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    async function fetchFlags() {
      const supabase = createClient();
      const { data } = await supabase
        .from("org_budget_pdf_settings")
        .select("documents_enabled, pricing_mode")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as {
        documents_enabled: boolean | null;
        pricing_mode: string | null;
      } | null;
      setState({
        documentsEnabled: row?.documents_enabled ?? true,
        singlePricing: row?.pricing_mode === "single",
        loading: false,
      });
    }

    fetchFlags();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}
