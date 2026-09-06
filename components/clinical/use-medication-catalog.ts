"use client";

/**
 * Búsqueda de medicamentos para el modal de Receta (mig 248).
 *
 * Combina dos fuentes, en este orden:
 *   1. `medication_catalog` de la org activa — el catálogo que administra la
 *      clínica (incluye lo importado de Farmacia y lo que no se vende ahí).
 *      Trae los valores por defecto con los que se prellena el formulario.
 *   2. Respaldo: los nombres distintos que la propia org ya recetó
 *      (`prescriptions`) — lo que había antes de que existiera el catálogo.
 *      Solo se consulta si el catálogo no devolvió coincidencias, para que
 *      la lista no mezcle dos cosas que se eligen distinto.
 *
 * Texto libre siempre vale: esto solo autocompleta.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MEDICATION_CATALOG_COLUMNS,
  medicationLabel,
  type MedicationCatalogItem,
} from "@/lib/clinical/medication-catalog";

export interface MedicationSuggestion {
  /** Clave estable para React. */
  key: string;
  source: "catalog" | "history";
  /** Lo que se escribe en el input al elegir. */
  name: string;
  /** Lo que se ve en la lista. */
  label: string;
  /** Solo en `source: "catalog"`: la fila completa, para prellenar. */
  item: MedicationCatalogItem | null;
}

/** Los metacaracteres de LIKE y las comas rompen el filtro de PostgREST. */
export function sanitizeLikeTerm(term: string): string {
  return term.trim().replace(/[%_,()"\\*]/g, " ").trim();
}

interface UseMedicationSearchReturn {
  suggestions: MedicationSuggestion[];
  /** true cuando ya hay una respuesta para el término actual (aunque sea vacía). */
  searched: boolean;
}

export function useMedicationSearch(
  term: string,
  enabled: boolean,
  organizationId: string | null,
): UseMedicationSearchReturn {
  const [suggestions, setSuggestions] = useState<MedicationSuggestion[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = sanitizeLikeTerm(term);
    if (!enabled || q.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const results: MedicationSuggestion[] = [];

      if (organizationId) {
        const { data } = await supabase
          .from("medication_catalog")
          .select(MEDICATION_CATALOG_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .ilike("name", `%${q}%`)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true })
          .limit(12);
        if (cancelled) return;
        for (const row of (data ?? []) as unknown as MedicationCatalogItem[]) {
          if (!row?.name?.trim()) continue;
          results.push({
            key: `catalog:${row.id}`,
            source: "catalog",
            name: row.name.trim(),
            label: medicationLabel(row),
            item: row,
          });
        }
      }

      // Respaldo: solo si el catálogo no tiene nada que ofrecer.
      if (results.length === 0) {
        const { data } = await supabase
          .from("prescriptions")
          .select("medication")
          .ilike("medication", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(15);
        if (cancelled) return;
        const seen = new Set<string>();
        for (const row of (data ?? []) as { medication: string | null }[]) {
          const name = (row.medication ?? "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key) || key === q.toLowerCase()) continue;
          seen.add(key);
          results.push({
            key: `history:${key}`,
            source: "history",
            name,
            label: name,
            item: null,
          });
          if (results.length >= 8) break;
        }
      }

      if (cancelled) return;
      setSuggestions(results);
      setSearched(true);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, enabled, organizationId]);

  return { suggestions, searched };
}

export interface CatalogDraft {
  name: string;
  concentration: string | null;
  pharmaceutical_form: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  dose_per_take: string | null;
  default_instructions: string | null;
}

/**
 * Guarda en el catálogo los medicamentos que el médico escribió a mano.
 *
 * Una fila por INSERT (no un lote) porque el índice único de la mig 248 es
 * por (org, nombre, concentración): en un lote, un duplicado tumbaría también
 * a los medicamentos nuevos. El 23505 se ignora en silencio — que ya exista
 * es exactamente el resultado deseado. Nunca rompe el guardado de la receta:
 * el catálogo es una comodidad, la receta ya está guardada.
 */
export async function saveDraftsToCatalog(
  organizationId: string,
  createdBy: string | null,
  drafts: CatalogDraft[],
): Promise<void> {
  if (!organizationId || drafts.length === 0) return;
  const supabase = createClient();
  for (const draft of drafts) {
    try {
      await supabase.from("medication_catalog").insert({
        organization_id: organizationId,
        created_by: createdBy,
        ...draft,
      });
    } catch {
      // Sin conexión o RLS: el catálogo no bloquea la receta.
    }
  }
}
