"use client";

// Dialog to customize which optional fields land in the Google Calendar
// event description. Renders a checkbox per field, grouped by category.
// Base fields (doctor, office, notes) are shown as "always included" but
// are not toggleable here.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings2, Check, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_DESCRIPTION_FIELDS,
  DESCRIPTION_FIELD_GROUPS,
  DESCRIPTION_FIELD_LABELS,
  type DescriptionFieldKey,
  type DescriptionFieldsConfig,
} from "@/lib/google-calendar-description";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function GCalDescriptionDialog({ open, onOpenChange, onSaved }: Props) {
  const [config, setConfig] = useState<DescriptionFieldsConfig>(DEFAULT_DESCRIPTION_FIELDS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current config when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/integrations/google/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.config) setConfig(data.config as DescriptionFieldsConfig);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = (key: DescriptionFieldKey) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/integrations/google/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No pudimos guardar. Intenta de nuevo.");
      return;
    }
    toast.success("Configuración actualizada. Se aplica desde la próxima cita.");
    onSaved?.();
    onOpenChange(false);
  };

  const activeCount = Object.values(config).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xl max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Personalizar descripción del evento
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Elige qué datos se incluyen en cada evento de Google Calendar.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Always-on fields */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Siempre incluidos
              </p>
              <div className="space-y-1.5 text-sm text-foreground/80">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500" /> Doctor
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500" /> Consultorio
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-500" /> Notas de la cita
                </div>
              </div>
            </div>

            {/* Toggleable fields */}
            {DESCRIPTION_FIELD_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.keys.map((key) => {
                    const { label, hint } = DESCRIPTION_FIELD_LABELS[key];
                    const checked = config[key];
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3 cursor-pointer hover:border-primary/40 hover:bg-accent/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(key)}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{label}</div>
                          {hint && (
                            <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* PHI warning */}
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>Importante:</strong> los datos que actives viajan a tu Google
              Calendar de la clínica. Revisa con tu equipo legal si activas campos
              sensibles (DNI, email) — quedan visibles para cualquiera con acceso
              a ese calendar.
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {activeCount} {activeCount === 1 ? "campo activo" : "campos activos"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
