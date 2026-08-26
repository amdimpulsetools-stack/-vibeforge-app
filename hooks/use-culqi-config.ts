"use client";

// Estado de la conexión Culqi de la org (Cobros al paciente — F1).
// Mismo patrón que use-einvoice-config: cache en módulo por org para
// que Settings y el modal "Cobrar por link" no dupliquen requests.
//
// `connected` = existe fila en culqi_config.
// `enabled`   = el toggle de la clínica (puede estar conectado pero
//               pausado).
// `testMode`  = la llave pública es pk_test_ (badge "Modo prueba").

import { useCallback, useEffect, useState } from "react";
import { useOrganization } from "@/components/organization-provider";

export interface CulqiConfigStatus {
  connected: boolean;
  public_key: string | null;
  enabled: boolean;
}

export interface UseCulqiConfigReturn {
  loading: boolean;
  connected: boolean;
  enabled: boolean;
  publicKey: string | null;
  testMode: boolean;
  refetch: () => void;
}

const cache = new Map<string, CulqiConfigStatus>();
const inflight = new Map<string, Promise<CulqiConfigStatus>>();

async function fetchStatus(orgId: string): Promise<CulqiConfigStatus> {
  const existing = inflight.get(orgId);
  if (existing) return existing;

  const promise = (async (): Promise<CulqiConfigStatus> => {
    try {
      const res = await fetch("/api/culqi-config");
      if (!res.ok) return { connected: false, public_key: null, enabled: false };
      const data = (await res.json()) as CulqiConfigStatus;
      return {
        connected: !!data.connected,
        public_key: data.public_key ?? null,
        enabled: !!data.enabled,
      };
    } catch {
      return { connected: false, public_key: null, enabled: false };
    } finally {
      inflight.delete(orgId);
    }
  })();

  inflight.set(orgId, promise);
  const result = await promise;
  cache.set(orgId, result);
  return result;
}

export function useCulqiConfig(): UseCulqiConfigReturn {
  const { organizationId } = useOrganization();
  const [status, setStatus] = useState<CulqiConfigStatus | null>(
    organizationId ? (cache.get(organizationId) ?? null) : null
  );
  const [loading, setLoading] = useState(!status);

  const load = useCallback(
    async (force = false) => {
      if (!organizationId) return;
      const cached = cache.get(organizationId);
      if (cached && !force) {
        setStatus(cached);
        setLoading(false);
        return;
      }
      setLoading(true);
      if (force) cache.delete(organizationId);
      const result = await fetchStatus(organizationId);
      setStatus(result);
      setLoading(false);
    },
    [organizationId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => {
    void load(true);
  }, [load]);

  return {
    loading,
    connected: status?.connected ?? false,
    enabled: status?.enabled ?? false,
    publicKey: status?.public_key ?? null,
    testMode: !!status?.public_key?.startsWith("pk_test_"),
    refetch,
  };
}
