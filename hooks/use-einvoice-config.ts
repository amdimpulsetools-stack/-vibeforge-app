"use client";

// Single source of truth for "is e-invoicing enabled for this org?".
//
// Every UI element related to facturación (fiscal data tabs, "Emitir"
// buttons, /facturacion page, etc.) must check `connected` before
// rendering. If `connected === false`, the module is invisible — same
// as if it didn't exist.
//
// Caches the response per-tab via a small in-module cache so multiple
// components asking simultaneously don't fan out into multiple HTTP
// requests. Refetches on `mutate()` (e.g. after the user finishes the
// connect wizard).

import { useEffect, useState, useCallback } from "react";
import { useOrganization } from "@/components/organization-provider";

export interface EInvoiceSeries {
  doc_type: number;
  series: string;
  current_number: number;
  is_default: boolean;
  is_active: boolean;
}

export interface EInvoiceConfigData {
  provider: string;
  mode: "sandbox" | "production";
  ruc: string;
  legal_name: string;
  fiscal_address: string | null;
  ubigeo: string | null;
  default_currency: "PEN" | "USD";
  default_igv_percent: number;
  auto_emit_on_payment: boolean;
  auto_send_email: boolean;
  last_error: string | null;
  last_error_at: string | null;
  last_success_at: string | null;
  connected_at: string;
}

export interface UseEInvoiceConfigReturn {
  loading: boolean;
  connected: boolean;
  config: EInvoiceConfigData | null;
  series: EInvoiceSeries[];
  /** Force a refetch (after connect/disconnect). */
  refetch: () => void;
}

interface CachedStatus {
  connected: boolean;
  config: EInvoiceConfigData | null;
  series: EInvoiceSeries[];
}

// Per-org cache so multiple components don't trigger N requests
const cache = new Map<string, CachedStatus>();
const inflight = new Map<string, Promise<CachedStatus>>();

async function fetchStatus(): Promise<CachedStatus> {
  const res = await fetch("/api/einvoices/status");
  if (!res.ok) {
    return { connected: false, config: null, series: [] };
  }
  const data = (await res.json()) as {
    connected: boolean;
    config?: EInvoiceConfigData;
    series?: EInvoiceSeries[];
  };
  return {
    connected: !!data.connected,
    config: data.config ?? null,
    series: data.series ?? [],
  };
}

export function useEInvoiceConfig(): UseEInvoiceConfigReturn {
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CachedStatus>({
    connected: false,
    config: null,
    series: [],
  });

  const load = useCallback(async () => {
    if (!organizationId) {
      setState({ connected: false, config: null, series: [] });
      setLoading(false);
      return;
    }

    // Prefer cache
    const cached = cache.get(organizationId);
    if (cached) {
      setState(cached);
      setLoading(false);
      return;
    }

    // Coalesce in-flight requests
    let promise = inflight.get(organizationId);
    if (!promise) {
      promise = fetchStatus().then((r) => {
        cache.set(organizationId, r);
        inflight.delete(organizationId);
        return r;
      });
      inflight.set(organizationId, promise);
    }

    setLoading(true);
    const result = await promise;
    setState(result);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => {
    if (organizationId) cache.delete(organizationId);
    void load();
  }, [organizationId, load]);

  return {
    loading,
    connected: state.connected,
    config: state.config,
    series: state.series,
    refetch,
  };
}
