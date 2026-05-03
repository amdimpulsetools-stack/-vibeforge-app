"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface ConflictInfo {
  conflicting_addon_key: string;
  conflicting_addon_name?: string;
  message: string;
}

interface ActivationResult {
  ok: true;
  addon_key: string;
  requires_setup: boolean;
  setup_url?: string;
  warnings?: string[];
}

interface ActivationError {
  ok: false;
  status: number;
  error: string;
  conflicting_addon_key?: string;
}

interface ModuleActivateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addonKey: string;
  addonName: string;
  addonDescription: string | null;
  addonFeatures: string[];
  setupUrl?: string;
  activate: (key: string) => Promise<ActivationResult | ActivationError>;
  onSuccess?: () => void;
}

export function ModuleActivateDialog({
  open,
  onOpenChange,
  addonKey,
  addonName,
  addonDescription,
  addonFeatures,
  setupUrl,
  activate,
  onSuccess,
}: ModuleActivateDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [goToSetup, setGoToSetup] = useState(true);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setConflict(null);
      setGoToSetup(true);
    }
  }, [open]);

  const handleActivate = async () => {
    setSubmitting(true);
    setConflict(null);
    const result = await activate(addonKey);
    setSubmitting(false);

    if (result.ok) {
      toast.success(`Modulo ${addonName} activado`);
      if (result.warnings?.length) {
        for (const w of result.warnings) toast.warning(w);
      }
      onSuccess?.();
      onOpenChange(false);

      const target = result.setup_url ?? setupUrl;
      if (goToSetup && target) {
        router.push(target);
      }
      return;
    }

    if (result.status === 409 && result.conflicting_addon_key) {
      setConflict({
        conflicting_addon_key: result.conflicting_addon_key,
        message: result.error,
      });
      return;
    }

    toast.error(result.error || "No pudimos activar el modulo");
  };

  const hasSetup = !!(setupUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold">
              Activar {addonName}
            </DialogTitle>
            {addonDescription && (
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                {addonDescription}
              </DialogDescription>
            )}
          </div>
        </div>

        {addonFeatures.length > 0 && (
          <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Que incluye
            </p>
            <ul className="space-y-2">
              {addonFeatures.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-xs leading-relaxed"
                >
                  <CheckCircle2 className="mt-[2px] h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          Al activar este modulo se habilitaran las funciones listadas arriba en
          tu organizacion. Podras desactivarlo en cualquier momento desde esta
          misma pantalla.
        </p>

        {hasSetup && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <Checkbox
              checked={goToSetup}
              onCheckedChange={(c) => setGoToSetup(c)}
            />
            <span className="text-xs leading-relaxed">
              Despues de activar llevame al wizard de configuracion
            </span>
          </label>
        )}

        {conflict && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">
                Ya tienes activo otro tier de este modulo
              </p>
              <p className="leading-relaxed">
                {conflict.message ||
                  "Debes desactivar el tier actual antes de activar este."}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={submitting || !!conflict}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Activando
              </>
            ) : (
              "Activar modulo"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
