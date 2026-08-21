"use client";

/**
 * Resumen del turno abierto: cuánto se cobró, con qué y en cuántas
 * operaciones.
 *
 * El efectivo esperado puede no venir en el JSON: con arqueo ciego activo el
 * RPC lo omite para quien no es admin (mig 215). Se muestra "•••" y no un 0,
 * porque un 0 se lee como "no hay plata" y es exactamente la confusión que
 * el arqueo ciego no debe provocar.
 */

import { Coins, Layers, Receipt } from "lucide-react";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import { getPaymentIcon } from "@/lib/payment-icons";
import {
  NO_METHOD,
  TENDER_LABEL,
  formatPEN,
  formatSignedPEN,
  type PaymentMethodLookup,
  type ShiftSummary,
} from "./types";

interface Props {
  summary: ShiftSummary | null;
  openingFloat: number;
  paymentMethods: PaymentMethodLookup[];
}

export function SummaryTab({ summary, openingFloat, paymentMethods }: Props) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
        Cargando el resumen del turno…
      </div>
    );
  }

  const byMethod = Object.entries(summary.payments_by_method ?? {}).sort(
    (a, b) => Number(b[1]) - Number(a[1])
  );
  const byTender = Object.entries(summary.payments_by_tender ?? {});
  const movTender = Object.entries(summary.movements_by_tender ?? {});

  // El icono se resuelve por la etiqueta del método, que es lo que
  // patient_payments guarda (texto libre alimentado por lookup_values).
  const iconByLabel = new Map(paymentMethods.map((m) => [m.label, m.icon]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="Cobrado en el turno"
          value={formatPEN(summary.payments_total)}
          animate
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="Operaciones"
          value={String(summary.operations_count)}
          hint={`${summary.payments_count} cobros · ${summary.movements_count} movimientos`}
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Efectivo esperado"
          value={
            summary.expected_cash != null ? formatPEN(summary.expected_cash) : "•••"
          }
          animate
          hint={
            summary.expected_cash != null
              ? `fondo ${formatPEN(openingFloat)} incluido`
              : "se revela al cerrar"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-4 py-3">
            <h3 className="text-sm font-bold">Cobros por método</h3>
          </div>
          {byMethod.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Todavía no hay cobros en este turno.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {byMethod.map(([method, total]) => {
                const Icon = getPaymentIcon(iconByLabel.get(method) ?? null);
                return (
                  <li
                    key={method}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {method === NO_METHOD ? "Sin método declarado" : method}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {formatPEN(Number(total))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-4 py-3">
            <h3 className="text-sm font-bold">Por tipo de medio</h3>
          </div>
          <ul className="divide-y divide-border/40">
            {byTender.length === 0 && movTender.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                Sin movimiento todavía.
              </li>
            )}
            {byTender.map(([tender, total]) => (
              <li
                key={`p-${tender}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {TENDER_LABEL[tender] ?? tender}
                </span>
                <span className="shrink-0 font-semibold">
                  {formatPEN(Number(total))}
                </span>
              </li>
            ))}
            {movTender.map(([tender, total]) => (
              <li
                key={`m-${tender}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  Movimientos de caja · {TENDER_LABEL[tender] ?? tender}
                </span>
                <span
                  className={`shrink-0 font-semibold ${
                    Number(total) < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-success-600 dark:text-success-400"
                  }`}
                >
                  {formatSignedPEN(Number(total))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  animate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  animate?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight">
        {/* key={value}: este resumen se recarga tras CADA cobro o movimiento
            del turno — sin key, cifras que no cambiaron re-animarían por
            acciones ajenas. Con key solo entra de nuevo si el número cambió.
            "Operaciones" queda quieta a propósito (conteo de apoyo). */}
        {animate ? <NumberPopIn key={value} value={value} /> : value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
