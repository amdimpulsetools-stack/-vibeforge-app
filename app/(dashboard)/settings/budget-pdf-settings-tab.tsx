"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface BudgetPdfSettings {
  vigencia_days: number;
  terms: string[];
  footer_text: string;
}

const DEFAULT_SETTINGS: BudgetPdfSettings = {
  vigencia_days: 30,
  terms: [
    "Vigencia del presupuesto: 30 días desde la fecha de emisión.",
    "Servicios médicos no contemplados en este presupuesto serán cotizados por separado.",
  ],
  footer_text: "",
};

export default function BudgetPdfSettingsTab() {
  const { organizationId } = useOrganization();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BudgetPdfSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!organizationId) return;

    async function fetchSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("org_budget_pdf_settings")
        .select("vigencia_days, terms, footer_text")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (data) {
        const row = data as {
          vigencia_days: number;
          terms: unknown;
          footer_text: string | null;
        };
        setSettings({
          vigencia_days: row.vigencia_days,
          terms: Array.isArray(row.terms)
            ? row.terms.filter((t): t is string => typeof t === "string")
            : [],
          footer_text: row.footer_text ?? "",
        });
      } else {
        const { data: created } = await supabase
          .from("org_budget_pdf_settings")
          .insert({
            organization_id: organizationId,
            vigencia_days: DEFAULT_SETTINGS.vigencia_days,
            terms: DEFAULT_SETTINGS.terms,
            footer_text: DEFAULT_SETTINGS.footer_text,
          })
          .select("vigencia_days, terms, footer_text")
          .single();
        if (created) {
          const row = created as {
            vigencia_days: number;
            terms: unknown;
            footer_text: string | null;
          };
          setSettings({
            vigencia_days: row.vigencia_days,
            terms: Array.isArray(row.terms)
              ? row.terms.filter((t): t is string => typeof t === "string")
              : [],
            footer_text: row.footer_text ?? "",
          });
        }
      }
      setLoading(false);
    }

    fetchSettings();
  }, [organizationId]);

  const handleSave = async () => {
    if (!organizationId) return;
    const days = Number(settings.vigencia_days);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      toast.error(
        language === "es"
          ? "La vigencia debe estar entre 1 y 365 días"
          : "Validity must be between 1 and 365 days",
      );
      return;
    }
    const cleanedTerms = settings.terms
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("org_budget_pdf_settings")
      .update({
        vigencia_days: days,
        terms: cleanedTerms,
        footer_text: settings.footer_text,
      })
      .eq("organization_id", organizationId);
    setSaving(false);

    if (error) {
      toast.error(
        (language === "es" ? "Error al guardar: " : "Save failed: ") +
          error.message,
      );
      return;
    }

    setSettings({ ...settings, terms: cleanedTerms });
    toast.success(
      language === "es"
        ? "Configuración del PDF guardada"
        : "Budget PDF settings saved",
    );
  };

  const updateTerm = (index: number, value: string) => {
    const next = [...settings.terms];
    next[index] = value;
    setSettings({ ...settings, terms: next });
  };

  const removeTerm = (index: number) => {
    setSettings({
      ...settings,
      terms: settings.terms.filter((_, i) => i !== index),
    });
  };

  const moveTerm = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= settings.terms.length) return;
    const next = [...settings.terms];
    [next[index], next[target]] = [next[target], next[index]];
    setSettings({ ...settings, terms: next });
  };

  const addTerm = () => {
    if (settings.terms.length >= 20) {
      toast.error(
        language === "es" ? "Máximo 20 términos" : "Maximum 20 terms",
      );
      return;
    }
    setSettings({ ...settings, terms: [...settings.terms, ""] });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {language === "es"
                ? "PDF de Presupuestos"
                : "Budget PDF"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {language === "es"
                ? "Personaliza el texto que aparece en los PDFs de presupuestos enviados a pacientes."
                : "Customize the text shown on budget PDFs sent to patients."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {language === "es"
              ? "Vigencia del presupuesto (días)"
              : "Budget validity (days)"}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={settings.vigencia_days}
            onChange={(e) =>
              setSettings({
                ...settings,
                vigencia_days: Number(e.target.value),
              })
            }
            className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
          <p className="text-[11px] text-muted-foreground">
            {language === "es"
              ? "Determina la fecha de vencimiento que aparece en el PDF."
              : "Sets the expiration date shown on the PDF."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">
            {language === "es"
              ? "Consideraciones"
              : "Considerations"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {language === "es"
              ? "Cada ítem aparece como bullet en la sección \"Consideraciones\" del PDF. Si dejas la lista vacía, no se muestra la sección."
              : "Each item appears as a bullet in the \"Considerations\" section of the PDF. Leave the list empty to hide the section."}
          </p>
        </div>

        <div className="space-y-2">
          {settings.terms.map((term, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={term}
                onChange={(e) => updateTerm(i, e.target.value)}
                rows={2}
                maxLength={500}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                placeholder={
                  language === "es"
                    ? "Ej: Vigencia del presupuesto: 30 días..."
                    : "e.g. Budget valid for 30 days..."
                }
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => moveTerm(i, -1)}
                  disabled={i === 0}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title={language === "es" ? "Subir" : "Move up"}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveTerm(i, 1)}
                  disabled={i === settings.terms.length - 1}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title={language === "es" ? "Bajar" : "Move down"}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeTerm(i)}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title={language === "es" ? "Eliminar" : "Remove"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {settings.terms.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {language === "es"
                ? "No hay consideraciones definidas."
                : "No considerations defined."}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={addTerm}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          {language === "es" ? "Agregar consideración" : "Add consideration"}
        </button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">
            {language === "es" ? "Pie de página" : "Footer text"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {language === "es"
              ? "Texto adicional que se muestra junto al nombre de la organización en el pie del PDF. Útil para datos de contacto o eslóganes. Déjalo vacío para no mostrar nada."
              : "Extra text shown next to the organization name in the PDF footer. Useful for contact info or a tagline. Leave empty to hide."}
          </p>
        </div>
        <textarea
          value={settings.footer_text}
          onChange={(e) =>
            setSettings({ ...settings, footer_text: e.target.value })
          }
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
          placeholder={
            language === "es"
              ? "Ej: contacto@miclinica.pe · +51 999 888 777"
              : "e.g. contact@myclinic.com · +1 555 123 4567"
          }
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving
          ? language === "es"
            ? "Guardando..."
            : "Saving..."
          : language === "es"
          ? "Guardar"
          : "Save"}
      </button>
    </div>
  );
}
