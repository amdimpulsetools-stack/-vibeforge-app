"use client";

/**
 * Cierre de caja: contar, comparar, firmar.
 *
 * El orden importa y está impuesto por el servidor, no por esta pantalla:
 * con arqueo ciego el esperado no viaja al cliente hasta que el turno se
 * cierra (mig 215). Aquí solo se escribe lo que se contó.
 *
 * El motivo aparece cuando la diferencia supera la tolerancia. Si el arqueo
 * es ciego, quien cuenta no puede saberlo de antemano: el RPC rechaza el
 * cierre con un mensaje claro y el campo se revela entonces. Es un viaje
 * extra a propósito — el motivo se escribe sabiendo ya el número real.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LockKeyhole } from "lucide-react";
import {
  DIFFERENCE_TONE_CLASS,
  differenceTone,
  formatPEN,
  formatSignedPEN,
  type CloseResult,
  type ShiftSummary,
} from "./types";

export interface ClosePayload {
  countedCash: number;
  countedByMethod: Record<string, number> | null;
  notes: string | null;
  reason: string | null;
}

interface Props {
  summary: ShiftSummary | null;
  tolerance: number;
  /** Métodos no-efectivo con movimiento en el turno, para conciliar. */
  electronicMethods: { method: string; total: number }[];
  onClose: (payload: ClosePayload) => Promise<string | null>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function CloseTab({
  summary,
  tolerance,
  electronicMethods,
  onClose,
}: Props) {
  const [counted, setCounted] = useState("");
  const [byMethod, setByMethod] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countedValue = Number(counted.replace(",", "."));
  const valid = counted.trim() !== "" && Number.isFinite(countedValue) && countedValue >= 0;

  // Solo se puede previsualizar cuando el esperado está visible (admin o
  // arqueo no ciego). Con arqueo ciego esto es undefined y no se muestra
  // nada: es justamente el punto.
  const preview = useMemo(() => {
    if (summary?.expected_cash == null || !valid) return null;
    const diff = countedValue - Number(summary.expected_cash);
    return { diff, tone: differenceTone(diff, tolerance) };
  }, [summary?.expected_cash, countedValue, valid, tolerance]);

  const reasonNeeded =
    showReason || (preview != null && Math.abs(preview.diff) > tolerance);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);

    const counts: Record<string, number> = {};
    for (const [method, raw] of Object.entries(byMethod)) {
      const v = Number(String(raw).replace(",", "."));
      if (raw !== "" && Number.isFinite(v)) counts[method] = v;
    }

    const err = await onClose({
      countedCash: countedValue,
      countedByMethod: Object.keys(counts).length > 0 ? counts : null,
      notes: notes.trim() || null,
      reason: reason.trim() || null,
    });
    setSaving(false);

    if (err) {
      setError(err);
      // El RPC pidió motivo: el campo se revela con el número ya sobre la
      // mesa (viene dentro del propio mensaje de error).
      if (/motivo/i.test(err)) setShowReason(true);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <LockKeyhole className="h-4 w-4 text-primary" /> Cerrar caja
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuenta el efectivo que tienes en el cajón —fondo incluido— y
          escríbelo. La diferencia se calcula sola.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Efectivo contado</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">S/</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {summary?.blind_count && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Arqueo ciego: el esperado se revela al cerrar.
              </p>
            )}
          </div>

          {preview && (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
              Esperado {formatPEN(summary?.expected_cash ?? 0)} · diferencia{" "}
              <span className={`font-bold ${DIFFERENCE_TONE_CLASS[preview.tone]}`}>
                {formatSignedPEN(preview.diff)}
              </span>
            </div>
          )}

          {reasonNeeded && (
            <div>
              <label className={labelCls}>Motivo de la diferencia</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. faltó vuelto de un cobro en efectivo"
                maxLength={300}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Notas del cierre (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. entrego el cajón a Ana"
              maxLength={300}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            onClick={() => void submit()}
            disabled={!valid || saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cerrar caja
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="border-b border-border/40 px-4 py-3">
          <h3 className="text-sm font-bold">Conciliación electrónica</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Opcional. No produce faltante: esa plata no pasa por el cajón.
          </p>
        </div>
        {electronicMethods.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Sin cobros electrónicos en este turno.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {electronicMethods.map(({ method, total }) => (
              <li key={method} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{method}</p>
                  <p className="text-[11px] text-muted-foreground">
                    sistema {formatPEN(total)}
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.10"
                    value={byMethod[method] ?? ""}
                    onChange={(e) =>
                      setByMethod((prev) => ({ ...prev, [method]: e.target.value }))
                    }
                    placeholder="voucher"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Pantalla de resultado: el número grande y su motivo, si lo hubo. */
export function CloseResultCard({
  result,
  onDone,
}: {
  result: CloseResult;
  onDone: () => void;
}) {
  const tone = differenceTone(result.difference_cash, result.difference_tolerance);
  const cuadra = Number(result.difference_cash) === 0;

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border/60 bg-card p-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Caja cerrada
      </p>
      <p className={`mt-2 text-4xl font-extrabold tracking-tight ${DIFFERENCE_TONE_CLASS[tone]}`}>
        {formatSignedPEN(result.difference_cash)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {cuadra
          ? "Cuadra exacto."
          : Number(result.difference_cash) > 0
            ? "Sobrante respecto a lo esperado."
            : "Faltante respecto a lo esperado."}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ResultStat label="Esperado" value={formatPEN(result.expected_cash)} />
        <ResultStat label="Contado" value={formatPEN(result.counted_cash)} />
        <ResultStat label="Cobros" value={String(result.payments_count)} />
      </div>

      {result.difference_reason && (
        <p className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground">
          <span className="font-semibold">Motivo:</span> {result.difference_reason}
        </p>
      )}

      {result.force_closed && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Cierre forzado: lo cerró un administrador distinto de quien abrió.
        </p>
      )}

      <div className="mt-5 flex justify-center gap-2 print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button onClick={onDone}>Listo</Button>
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
