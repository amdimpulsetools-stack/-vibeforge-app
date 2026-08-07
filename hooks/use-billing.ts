"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrganization } from "@/components/organization-provider";

interface PaymentRecord {
  id: string;
  mp_payment_id: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  description: string | null;
  created_at: string;
}

export interface ActiveAddon {
  id: string;
  addon_type: "extra_member" | "extra_office";
  quantity: number;
  unit_price: number;
  created_at: string;
}

interface BillingInfo {
  subscription: Record<string, unknown> | null;
  payments: PaymentRecord[];
  addons: ActiveAddon[];
  mp_status: Record<string, unknown> | null;
}

interface UseBillingReturn {
  billing: BillingInfo | null;
  loading: boolean;
  /** Add extra members or offices to the subscription */
  addAddon: (
    addonType: "extra_member" | "extra_office",
    quantity: number
  ) => Promise<{ success: boolean; message: string; new_total?: number; error_code?: string }>;
  /** Cancel an active addon by id, releases the slot and lowers MP charge */
  cancelAddon: (
    addonId: string
  ) => Promise<{ success: boolean; message: string; new_total?: number | null; error_code?: string }>;
  refetch: () => void;
}

// ── Caché + deduplicación de /api/mercadopago/subscription ──────
//
// El hook se usa tres veces en /account (la página, ActiveAddonsCard y el
// modal de compra de cupos) y cada instancia hacía su propio GET. Ese
// endpoint llama a Mercado Pago —un tercero— y tiene un rate limit de 5
// req/min por usuario: navegar a /account un par de veces seguidas bastaba
// para que devolviera 429 y la UI de facturación se quedara en el estado de
// fallback.
//
// Con la deduplicación, N instancias montadas a la vez comparten UNA
// petición, y una revisita dentro del TTL no genera ninguna. Las mutaciones
// (addAddon/cancelAddon) y `refetch` siguen forzando datos frescos, así que
// no cambia nada de lo que el usuario ve.
const BILLING_TTL_MS = 30_000;
const billingCache = new Map<string, { value: BillingInfo; at: number }>();
const billingInFlight = new Map<string, Promise<BillingInfo | null>>();

function getCachedBilling(organizationId: string): BillingInfo | null {
  const hit = billingCache.get(organizationId);
  if (!hit) return null;
  if (Date.now() - hit.at > BILLING_TTL_MS) {
    billingCache.delete(organizationId);
    return null;
  }
  return hit.value;
}

function loadBilling(
  organizationId: string,
  force: boolean,
): Promise<BillingInfo | null> {
  if (!force) {
    const cached = getCachedBilling(organizationId);
    if (cached) return Promise.resolve(cached);
    const pending = billingInFlight.get(organizationId);
    if (pending) return pending;
  }

  const request = (async (): Promise<BillingInfo | null> => {
    try {
      const res = await fetch("/api/mercadopago/subscription");
      if (!res.ok) return null;
      const data = (await res.json()) as BillingInfo;
      billingCache.set(organizationId, { value: data, at: Date.now() });
      return data;
    } catch {
      // handled silently — billing UI shows fallback state
      return null;
    }
  })().finally(() => {
    if (billingInFlight.get(organizationId) === request) {
      billingInFlight.delete(organizationId);
    }
  });

  billingInFlight.set(organizationId, request);
  return request;
}

export function useBilling(): UseBillingReturn {
  const { organizationId } = useOrganization();
  const [billing, setBilling] = useState<BillingInfo | null>(() =>
    organizationId ? getCachedBilling(organizationId) : null,
  );
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback(
    async (force = false) => {
      if (!organizationId) return;

      const data = await loadBilling(organizationId, force);
      if (data) setBilling(data);
      setLoading(false);
    },
    [organizationId],
  );

  useEffect(() => {
    if (organizationId) {
      fetchBilling();
    } else {
      setLoading(false);
    }
  }, [organizationId, fetchBilling]);

  const addAddon = async (
    addonType: "extra_member" | "extra_office",
    quantity: number
  ) => {
    try {
      const res = await fetch("/api/mercadopago/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_type: addonType, quantity }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: data.message || data.error || "Error al agregar addon",
          error_code: data.error,
        };
      }

      await fetchBilling(true);

      return {
        success: true,
        message: data.message,
        new_total: data.new_monthly_total,
      };
    } catch {
      return {
        success: false,
        message: "Error de conexion",
      };
    }
  };

  const cancelAddon = async (addonId: string) => {
    try {
      const res = await fetch("/api/addons/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_id: addonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          message: data.message || data.error || "Error al cancelar el cupo extra",
          error_code: data.error,
        };
      }

      await fetchBilling(true);

      return {
        success: true,
        message: data.message,
        new_total: data.new_monthly_total ?? null,
      };
    } catch {
      return {
        success: false,
        message: "Error de conexion",
      };
    }
  };

  return {
    billing,
    loading,
    addAddon,
    cancelAddon,
    refetch: () => {
      void fetchBilling(true);
    },
  };
}
