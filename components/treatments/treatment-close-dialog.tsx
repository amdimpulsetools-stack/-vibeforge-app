"use client";

/**
 * Cierre de un TRATAMIENTO.
 *
 * La pantalla habla en el idioma de la clínica ("Embarazo confirmado") y
 * este componente traduce al par status/outcome que espera la mig 242 —
 * así el enum no se filtra a la UI ni la UI inventa combinaciones.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgToday } from "@/hooks/use-org-today";
import { cn, formatCurrency } from "@/lib/utils";
import type { TreatmentMoney } from "@/lib/treatments/money";
import {
  ABANDON_REASON_OPTIONS,
  type TreatmentCloseInput,
} from "@/types/treatments";

export interface TreatmentCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  money: TreatmentMoney;
  /** Se llama tras un cierre exitoso para que el padre refresque. */
  onClosed: () => void;
}

type CloseChoice = "pregnancy" | "no_pregnancy" | "abandoned" | "transferred";

const CHOICES: { value: CloseChoice; label: string; help: string }[] = [
  {
    value: "pregnancy",
    label: "Embarazo confirmado",
    help: "El tratamiento cumplió su objetivo.",
  },
  {
    value: "no_pregnancy",
    label: "Completado sin embarazo",
    help: "Se terminó el ciclo acordado sin resultado positivo.",
  },
  {
    value: "abandoned",
    label: "Abandonado",
    help: "La paciente no continuó.",
  },
  {
    value: "transferred",
    label: "Derivado a otro centro",
    help: "Continúa fuera de la clínica.",
  },
];

/** Mapeo único UI → (status, outcome) de la mig 242. */
const CHOICE_TO_PAYLOAD: Record<
  CloseChoice,
  Pick<TreatmentCloseInput, "status" | "outcome">
> = {
  pregnancy: { status: "completed", outcome: "pregnancy" },
  no_pregnancy: { status: "completed", outcome: "no_pregnancy" },
  abandoned: { status: "abandoned", outcome: "abandoned" },
  transferred: { status: "completed", outcome: "transferred" },
};

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

export function TreatmentCloseDialog({
  open,
  onOpenChange,
  treatmentId,
  money,
  onClosed,
}: TreatmentCloseDialogProps) {
  const { today: orgToday } = useOrgToday();
  const [choice, setChoice] = useState<CloseChoice>("pregnancy");
  const [abandonReason, setAbandonReason] = useState<string>(
    ABANDON_REASON_OPTIONS[0],
  );
  const [reasonDetail, setReasonDetail] = useState("");
  const [closedAt, setClosedAt] = useState(() => orgToday());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice("pregnancy");
    setAbandonReason(ABANDON_REASON_OPTIONS[0]);
    setReasonDetail("");
    setClosedAt(orgToday());
    setSaving(false);
  }, [open, orgToday]);

  const submit = async () => {
    setSaving(true);
    const base = CHOICE_TO_PAYLOAD[choice];
    // El motivo solo viaja cuando el cierre es un abandono: en los demás
    // casos el outcome ya lo explica todo.
    const reason =
      choice === "abandoned"
        ? [abandonReason, reasonDetail.trim()].filter(Boolean).join(" — ")
        : "";
    const body: TreatmentCloseInput = {
      ...base,
      closed_at: closedAt,
      ...(reason ? { reason } : {}),
    };

    try {
      const res = await fetch(`/api/treatments/${treatmentId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudo cerrar el tratamiento");
        setSaving(false);
        return;
      }
      toast.success("Tratamiento cerrado");
      onClosed();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo cerrar el tratamiento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar tratamiento</DialogTitle>
          <DialogDescription>
            ¿Cómo terminó? Queda registrado en el historial de la paciente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            {CHOICES.map((c) => (
              <label
                key={c.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm",
                  choice === c.value
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <input
                  type="radio"
                  name="treatment-close-choice"
                  className="mt-0.5"
                  checked={choice === c.value}
                  onChange={() => setChoice(c.value)}
                />
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.help}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {choice === "abandoned" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Motivo
                </label>
                <select
                  value={abandonReason}
                  onChange={(e) => setAbandonReason(e.target.value)}
                  className={inputClass}
                >
                  {ABANDON_REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detalle (opcional)
                </label>
                <textarea
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  rows={2}
                  className={cn(inputClass, "resize-none")}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fecha de cierre
            </label>
            <input
              type="date"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className={inputClass}
            />
          </div>

          {money.pending > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Quedan {formatCurrency(money.pending)} por cobrar. Al cerrar, el
                tratamiento deja de aceptar pagos (la dirección puede
                reabrirlo).
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent md:h-auto md:py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 md:h-auto md:py-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cerrar tratamiento
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
