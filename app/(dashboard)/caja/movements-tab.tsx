"use client";

/**
 * Todo lo que pasó por el cajón, en una sola línea de tiempo.
 *
 * Cobros y movimientos de caja van intercalados por hora a propósito: la
 * pregunta real de la cajera no es "¿qué cobré?" sino "¿qué pasó desde que
 * abrí?". Los cobros son de solo lectura — este módulo nunca edita un pago,
 * eso vive en los formularios clínicos.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark } from "lucide-react";
import { getPaymentIcon } from "@/lib/payment-icons";
import {
  MOVEMENT_LABEL,
  REASON_LABEL,
  fmtTime,
  formatPEN,
  formatSignedPEN,
  patientName,
  type CashMovement,
  type MovementType,
  type PaymentMethodLookup,
  type ShiftPayment,
} from "./types";

interface Props {
  payments: ShiftPayment[];
  movements: CashMovement[];
  paymentMethods: PaymentMethodLookup[];
  authors: Record<string, string>;
  onNewMovement: (type: MovementType) => void;
}

type Row =
  | { kind: "payment"; at: string; payment: ShiftPayment }
  | { kind: "movement"; at: string; movement: CashMovement };

export function MovementsTab({
  payments,
  movements,
  paymentMethods,
  authors,
  onNewMovement,
}: Props) {
  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...payments.map((p) => ({ kind: "payment" as const, at: p.created_at, payment: p })),
      ...movements.map((m) => ({ kind: "movement" as const, at: m.created_at, movement: m })),
    ];
    return all.sort((a, b) => b.at.localeCompare(a.at));
  }, [payments, movements]);

  const iconByLabel = useMemo(
    () => new Map(paymentMethods.map((m) => [m.label, m.icon])),
    [paymentMethods]
  );

  return (
    <div className="space-y-4">
      {/* 'devolucion' no se ofrece en esta fase: exige paciente o pago de
          origen y su flujo natural llega con Farmacia (F4). */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onNewMovement("egreso")}>
          <ArrowUpRight className="h-4 w-4" /> Egreso
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNewMovement("sangria")}>
          <Landmark className="h-4 w-4" /> Sangría
        </Button>
        <Button variant="outline" size="sm" onClick={() => onNewMovement("ingreso")}>
          <ArrowDownLeft className="h-4 w-4" /> Ingreso
        </Button>
      </div>

      <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            Todavía no pasó nada por la caja en este turno.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((row) =>
              row.kind === "payment" ? (
                <PaymentRow
                  key={`p-${row.payment.id}`}
                  payment={row.payment}
                  iconByLabel={iconByLabel}
                />
              ) : (
                <MovementRow
                  key={`m-${row.movement.id}`}
                  movement={row.movement}
                  author={authors[row.movement.created_by ?? ""] ?? null}
                />
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function PaymentRow({
  payment,
  iconByLabel,
}: {
  payment: ShiftPayment;
  iconByLabel: Map<string, string | null>;
}) {
  const Icon = getPaymentIcon(iconByLabel.get(payment.payment_method ?? "") ?? null);
  const name = patientName(payment);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="w-11 shrink-0 text-[11px] font-semibold text-muted-foreground">
        {fmtTime(payment.created_at)}
      </span>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name ?? "Cobro"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {payment.payment_method?.trim() || "Sin método declarado"}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-success-600 dark:text-success-400">
        {formatPEN(Number(payment.amount))}
      </span>
    </li>
  );
}

function MovementRow({
  movement,
  author,
}: {
  movement: CashMovement;
  author: string | null;
}) {
  const negative = Number(movement.amount) < 0;
  return (
    <li className="flex items-center gap-3 bg-muted/20 px-4 py-3">
      <span className="w-11 shrink-0 text-[11px] font-semibold text-muted-foreground">
        {fmtTime(movement.created_at)}
      </span>
      <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {MOVEMENT_LABEL[movement.movement_type]}
          {movement.reason_code
            ? ` · ${REASON_LABEL[movement.reason_code] ?? movement.reason_code}`
            : ""}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[movement.notes, author].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <span
        className={`shrink-0 text-sm font-bold ${
          negative
            ? "text-red-600 dark:text-red-400"
            : "text-success-600 dark:text-success-400"
        }`}
      >
        {formatSignedPEN(Number(movement.amount))}
      </span>
    </li>
  );
}
