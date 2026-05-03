"use client";

import { useCallback, useEffect, useState } from "react";

export interface FertilityCanonicalCategory {
  category_key: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  is_essential: boolean;
}

export interface FertilityCanonicalMapping {
  category_key: string;
  services: { id: string; name: string }[];
}

interface FetchState {
  categories: FertilityCanonicalCategory[];
  mappings: FertilityCanonicalMapping[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for the fertility canonical-mapping wizard. Fetches the catalog
 * and the current org mapping, exposes a save() function and a refetch().
 */
export function useFertilityCanonicalMapping() {
  const [state, setState] = useState<FetchState>({
    categories: [],
    mappings: [],
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch("/api/admin/fertility/canonical-mapping");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al cargar el mapeo");
      }
      const data = await res.json();
      setState({
        categories: data.categories ?? [],
        mappings: data.mappings ?? [],
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState({
        categories: [],
        mappings: [],
        isLoading: false,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }, []);

  const save = useCallback(
    async (
      mappings: { category_key: string; service_ids: string[] }[]
    ): Promise<
      | { ok: true; saved: number; missing_essentials: string[] }
      | { ok: false; error: string }
    > => {
      const res = await fetch("/api/admin/fertility/canonical-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: body.error ?? "Error al guardar" };
      }
      await refetch();
      return {
        ok: true,
        saved: body.saved ?? 0,
        missing_essentials: body.missing_essentials ?? [],
      };
    },
    [refetch]
  );

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    categories: state.categories,
    mappings: state.mappings,
    isLoading: state.isLoading,
    error: state.error,
    save,
    refetch,
  };
}
