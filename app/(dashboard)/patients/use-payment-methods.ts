"use client";

/**
 * Métodos de pago del lookup, para la ficha del paciente.
 *
 * Los cobros se registran desde tres sitios distintos y hasta hoy cada
 * uno escribía `patient_payments.payment_method` con su propio
 * vocabulario: el sidebar del scheduler guardaba la LABEL del lookup
 * ("Efectivo", "Yape / Plin"), el formulario de pago de la ficha dejaba
 * escribir texto libre, y el panel de presupuestos guardaba slugs
 * hardcodeados ('cash', 'yape', …). El arqueo de Caja agrupa por ese
 * texto, así que la misma plata aparecía repartida entre tres cubos —
 * o directamente bajo "Sin método declarado".
 *
 * Una sola fuente: `lookup_values` de la categoría 'payment_method',
 * activos, los de la org MÁS los globales (organization_id IS NULL),
 * ordenados por display_order. Idéntica query que
 * `hooks/use-scheduler-master-data.ts`; lo que se guarda es SIEMPRE
 * `label`, igual que el sidebar.
 *
 * Va por React Query con la misma key para que el drawer y el panel de
 * presupuestos —que se renderizan a la vez en la pestaña Presupuestos—
 * compartan una única lectura.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PaymentMethodOption {
  id: string;
  label: string;
  icon: string | null;
}

export function usePaymentMethods(organizationId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["lookup-payment-methods", organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PaymentMethodOption[]> => {
      const { data } = await createClient()
        .from("lookup_values")
        .select("id, label, icon, display_order, lookup_categories!inner(slug)")
        .eq("lookup_categories.slug", "payment_method")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        .order("display_order");

      return ((data ?? []) as { id: string; label: string; icon: string | null }[]).map(
        (v) => ({ id: v.id, label: v.label, icon: v.icon }),
      );
    },
  });

  return data ?? [];
}
