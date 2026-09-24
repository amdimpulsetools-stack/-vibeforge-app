"use client";

/**
 * Vista previa del presupuesto con datos de ejemplo (Ajustes →
 * Presupuestos). Solo aparece si la org tiene un plugin de presupuestos
 * instalado (hoy: Dra. Patricia Quispe y Vitra).
 *
 * El PDF sale del MISMO render que el real (`/api/budgets/preview-pdf`):
 * marca, plugin, vigencia, términos y pie guardados. Solo la paciente es
 * ficticia ("Paciente de Ejemplo", DNI 00000000) y nada se guarda.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";

interface TemplateOption {
  value: string;
  label: string;
}

export function BudgetPdfPreviewCard({ organizationId }: { organizationId: string | null }) {
  const [pluginName, setPluginName] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/budgets/preview-pdf?organization_id=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => ({}))) as {
          plugin?: { name: string } | null;
          templates?: TemplateOption[];
        };
        if (cancelled) return;
        setPluginName(json.plugin?.name ?? null);
        setTemplates(json.templates ?? []);
        setTemplate(json.templates?.[0]?.value ?? "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (loading || !pluginName || templates.length === 0) return null;

  const preview = async () => {
    if (!organizationId || !template) return;
    // La pestaña se abre YA, en el mismo clic: abrirla después del fetch
    // la bloquearía el navegador como ventana emergente.
    const tab = window.open("", "_blank");
    setRendering(true);
    try {
      const res = await fetch("/api/budgets/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, template }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        tab?.close();
        toast.error(err.error ?? "No se pudo generar la vista previa");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      // El PDF ya quedó cargado en la pestaña; se libera el blob después.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast.error("No se pudo generar la vista previa");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Vista previa del presupuesto</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Genera el PDF tal cual lo recibe una paciente ({pluginName}), con datos de ejemplo:
          «Paciente de Ejemplo», DNI 00000000. Usa la vigencia, las consideraciones y el pie{" "}
          <strong>guardados</strong> — guarda los cambios de arriba antes de previsualizar. No se
          crea ningún presupuesto.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          aria-label="Plantilla a previsualizar"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 sm:max-w-md"
        >
          {templates.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={preview}
          disabled={rendering || !template}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {rendering ? "Generando…" : "Ver vista previa"}
        </button>
      </div>
      {rendering && (
        <p className="text-[11px] text-muted-foreground">
          La primera vista previa puede tardar hasta 15 segundos (el motor de PDF arranca en frío).
        </p>
      )}
    </div>
  );
}
