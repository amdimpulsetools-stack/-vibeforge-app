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

interface BillingInfo {
  subscription: Record<string, unknown> | null;
  payments: PaymentRecord[];
  mp_status: Record<string, unknown> | null;
}

interface UseBillingReturn {
  billing: BillingInfo | null;
  loading: boolean;
  /** Add extra members or offices to the subscription */
  addAddon: (
    addonType: "extra_member" | "extra_office",
    quantity: number
  ) => Promise<{ success: boolean; message: string; new_total?: number }>;
  refetch: () => void;
}

export function useBilling(): UseBillingReturn {
  const { organizationId } = useOrganization();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback(async () => {
    if (!organizationId) return;

    try {
      const res = await fetch("/api/mercadopago/subscription");
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      // handled silently — billing UI shows fallback state
    }
    setLoading(false);
  }, [organizationId]);

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
          message: data.error || "Error al agregar addon",
        };
      }

      await fetchBilling();

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

  return {
    billing,
    loading,
    addAddon,
    refetch: fetchBilling,
  };
}
