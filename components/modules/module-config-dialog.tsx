"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Settings as SettingsIcon,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface ConfigLink {
  label: string;
  description?: string;
  href: string;
}

interface ModuleConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addonKey: string;
  addonName: string;
  configLinks: ConfigLink[];
  onDeactivate: () => Promise<boolean>;
}

export function ModuleConfigDialog({
  open,
  onOpenChange,
  addonName,
  configLinks,
  onDeactivate,
}: ModuleConfigDialogProps) {
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmingDeactivate(false);
      setDeactivating(false);
    }
  }, [open]);

  const handleDeactivate = async () => {
    setDeactivating(true);
    const ok = await onDeactivate();
    setDeactivating(false);
    if (ok) {
      toast.success(`Modulo ${addonName} desactivado`);
      onOpenChange(false);
    } else {
      toast.error("No pudimos desactivar el modulo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold">
              Configuracion de {addonName}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              Ajusta como funciona este modulo dentro de tu clinica.
            </DialogDescription>
          </div>
        </div>

        {configLinks.length > 0 ? (
          <div className="space-y-2">
            {configLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => onOpenChange(false)}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{link.label}</p>
                  {link.description && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {link.description}
                    </p>
                  )}
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Este modulo no tiene opciones de configuracion adicionales.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <div>
              <p className="text-xs font-semibold text-destructive">
                Zona de peligro
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Las features se ocultaran al final del ciclo de facturacion
                actual.
              </p>
            </div>
          </div>

          {!confirmingDeactivate ? (
            <button
              type="button"
              onClick={() => setConfirmingDeactivate(true)}
              className="inline-flex w-full items-center justify-center rounded-lg border border-destructive/40 bg-background px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            >
              Desactivar modulo
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-destructive">
                Confirma la desactivacion de {addonName}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDeactivate(false)}
                  disabled={deactivating}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {deactivating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Desactivando
                    </>
                  ) : (
                    "Si, desactivar"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
