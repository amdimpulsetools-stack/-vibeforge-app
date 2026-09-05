"use client";

/**
 * Card de un tratamiento en la lista (/tratamientos).
 *
 * Todo el dinero sale de `item.money` (fórmula única, mig 245): aquí no se
 * suma ni se resta nada. La etiqueta es "pagado / acordado / por cobrar",
 * nunca "ingresos" ni "ganancia".
 */

import Link from "next/link";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, Plus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  TREATMENT_OUTCOME_LABELS,
  type TreatmentListItem,
} from "@/types/treatments";

export interface TreatmentCardProps {
  item: TreatmentListItem;
  /** "Hoy" civil de la org — para la antigüedad en días. */
  today: string;
  /** Abre el diálogo de pago. Ausente ⇒ no se pinta el botón (cerrados). */
  onAddPayment?: (item: TreatmentListItem) => void;
}

/** yyyy-MM-dd → "12 mar". parseISO evita el desfase de huso de new Date(str). */
function shortDate(d: string): string {
  return format(parseISO(d), "d MMM", { locale: es });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Badge del resultado de un tratamiento cerrado. */
function OutcomeBadge({ item }: { item: TreatmentListItem }) {
  if (!item.outcome) return null;
  const tone =
    item.outcome === "pregnancy"
      ? "bg-emerald-500/15 text-emerald-600"
      : item.outcome === "abandoned"
        ? "bg-muted text-muted-foreground"
        : "bg-blue-500/15 text-blue-600";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
          tone,
        )}
      >
        {TREATMENT_OUTCOME_LABELS[item.outcome]}
      </span>
      {item.outcome === "abandoned" && item.outcome_reason && (
        <span className="text-[11px] italic text-muted-foreground">
          {item.outcome_reason}
        </span>
      )}
    </span>
  );
}

export function TreatmentCard({ item, today, onAddPayment }: TreatmentCardProps) {
  const { money } = item;
  const days = differenceInCalendarDays(parseISO(today), parseISO(item.started_at));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold uppercase text-emerald-600">
          {initialsOf(item.patient_name)}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{item.patient_name}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {item.title}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {item.doctor_name ?? "Sin doctora asignada"} · desde{" "}
            {shortDate(item.started_at)} ({Math.max(0, days)} d)
          </p>

          {/* Barra de avance = money.progressPercent (cubierto/acordado). */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${money.progressPercent}%` }}
            />
          </div>

          <p className="text-xs">
            <span className="font-semibold">
              {formatCurrency(money.paidClinic)}
            </span>{" "}
            <span className="text-muted-foreground">
              pagado de {formatCurrency(money.expectedTotal)} acordado · por
              cobrar{" "}
            </span>
            <span
              className={cn(
                "font-semibold",
                money.pending > 0 ? "text-amber-600" : "text-emerald-600",
              )}
            >
              {formatCurrency(money.pending)}
            </span>
          </p>

          {money.externalCovered > 0 && (
            <p className="text-[11px] text-muted-foreground">
              + {formatCurrency(money.externalCovered)} pagado directo a
              terceros
            </p>
          )}

          {item.last_payment_at && (
            <p className="text-[11px] text-muted-foreground/80">
              Último pago {shortDate(item.last_payment_at)}
            </p>
          )}

          {item.status !== "in_progress" && <OutcomeBadge item={item} />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {onAddPayment && (
          <button
            type="button"
            onClick={() => onAddPayment(item)}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400 md:h-auto md:py-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Pago
          </button>
        )}
        <Link
          href={`/tratamientos/${item.id}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent md:h-auto md:py-1.5"
        >
          Abrir
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
