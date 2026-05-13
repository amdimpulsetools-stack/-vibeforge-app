"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * <FertilitySetupBanner />
 *
 * Renders a sticky red banner when the org has the fertility addon
 * enabled but has NOT mapped its services to the essential canonical
 * categories. Without that mapping, the followup cron silently skips
 * patients — emails / WhatsApp never go out — and the addon looks
 * "active but broken". This banner makes the broken state loud and
 * gives a one-click path to fix it.
 *
 * The parent decides when to mount this (e.g. only on pages where
 * fertility is relevant). The component itself fetches the mapping
 * endpoint and renders nothing while loading or when complete.
 */
export function FertilitySetupBanner() {
  const [missing, setMissing] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/fertility/canonical-mapping", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const data = (await res.json()) as {
          categories?: Array<{
            category_key: string;
            display_name: string;
            is_essential?: boolean;
          }>;
          mappings?: Array<{
            category_key: string;
            services?: { id: string }[];
          }>;
        };
        const categories = Array.isArray(data.categories) ? data.categories : [];
        const mappings = Array.isArray(data.mappings) ? data.mappings : [];

        const mappedKeys = new Set(
          mappings
            .filter((m) => Array.isArray(m.services) && m.services.length > 0)
            .map((m) => m.category_key),
        );

        const missingKeys = categories
          .filter((c) => c.is_essential && !mappedKeys.has(c.category_key))
          .map((c) => c.category_key);

        const labelMap: Record<string, string> = {};
        for (const c of categories) labelMap[c.category_key] = c.display_name;

        if (!cancelled) {
          setMissing(missingKeys);
          setLabels(labelMap);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || missing.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/[0.08] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
            Configuración de fertilidad incompleta
          </p>
          <p className="text-xs text-muted-foreground">
            Los recordatorios automáticos (email + WhatsApp) no se enviarán
            mientras las categorías esenciales no estén mapeadas a tus
            servicios.
          </p>
        </div>
        <p className="text-xs text-rose-700/90 dark:text-rose-400/90">
          Sin mapear:{" "}
          <strong>
            {missing
              .map((k) => labels[k] ?? k)
              .join(", ")}
          </strong>
        </p>
        <Link
          href="/admin/addon-config/fertility/canonical-mapping"
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Completar configuración
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
