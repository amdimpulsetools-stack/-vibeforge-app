"use client";

/**
 * Ajustes del módulo Caja — y, la primera vez, su interruptor.
 *
 * La fila de `cash_settings` es lo que enciende el módulo (mig 214): sin
 * ella el trigger `caja_stamp_payment` sale en la primera consulta y la
 * organización se comporta exactamente como antes. Por eso este mismo
 * formulario sirve para activar y para editar: activar ES crear la fila.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import type { CashSettings } from "./types";

export interface SettingsPayload {
  shift_scope: "user" | "organization";
  require_blind_count: boolean;
  default_opening_float: number;
  difference_tolerance: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = todavía no existe la fila: el guardado activa el módulo. */
  settings: CashSettings | null;
  onSubmit: (payload: SettingsPayload) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function SettingsModal({ open, onOpenChange, settings, onSubmit }: Props) {
  const [scope, setScope] = useState<"user" | "organization">("user");
  const [blind, setBlind] = useState(true);
  const [float, setFloat] = useState("0");
  const [tolerance, setTolerance] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setScope(settings?.shift_scope ?? "user");
    setBlind(settings?.require_blind_count ?? true);
    setFloat(String(settings?.default_opening_float ?? 0));
    setTolerance(String(settings?.difference_tolerance ?? 0));
    setError(null);
  }, [open, settings]);

  const floatValue = Number(float.replace(",", "."));
  const toleranceValue = Number(tolerance.replace(",", "."));
  const valid =
    Number.isFinite(floatValue) &&
    floatValue >= 0 &&
    Number.isFinite(toleranceValue) &&
    toleranceValue >= 0;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onSubmit({
      shift_scope: scope,
      require_blind_count: blind,
      default_opening_float: floatValue,
      difference_tolerance: toleranceValue,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
    else setError("No se pudo guardar la configuración. Intenta de nuevo.");
  }

  const activating = settings === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {activating ? "Configura tu caja" : "Ajustes de Caja"}
          </DialogTitle>
          <DialogDescription>
            {activating
              ? "Al guardar, los cobros nuevos empiezan a vincularse al turno abierto. Los cobros anteriores no se tocan."
              : "Cambia el alcance del turno, el arqueo ciego y los montos por defecto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Alcance del turno</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <ScopeOption
                active={scope === "user"}
                title="Una caja por persona"
                description="Cada quien abre y cierra la suya. El cobro cae en el turno de quien lo digita."
                onClick={() => setScope("user")}
              />
              <ScopeOption
                active={scope === "organization"}
                title="Una caja por clínica"
                description="La abre quien llega primero y todos los cobros del día caen ahí."
                onClick={() => setScope("organization")}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <input
              type="checkbox"
              checked={blind}
              onChange={(e) => setBlind(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-semibold">Arqueo ciego</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Quien cuenta no ve el efectivo esperado hasta cerrar. Es lo que
                evita que un faltante se &ldquo;corrija&rdquo; escribiendo la
                cifra correcta en vez de contando. Los administradores siempre
                lo ven.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fondo inicial por defecto</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">S/</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.10"
                  value={float}
                  onChange={(e) => setFloat(e.target.value)}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Se precarga al abrir caja; siempre es editable.
              </p>
            </div>
            <div>
              <label className={labelCls}>Tolerancia de diferencia</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">S/</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.10"
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Por encima de este monto, el cierre exige un motivo escrito.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={!valid || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {activating ? "Activar Caja" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/10"
          : "border-border/60 hover:border-border"
      }`}
    >
      <span
        className={`block text-sm font-semibold ${active ? "text-primary" : ""}`}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
