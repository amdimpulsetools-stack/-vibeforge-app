"use client";

/**
 * Historial de arqueos (solo administradores) y bandeja "Fuera de turno".
 *
 * Las dos cosas viven juntas porque responden a la misma pregunta del dueño:
 * ¿está toda la plata contada? El historial muestra los turnos que se
 * cerraron; la bandeja, los cobros que entraron sin caja abierta y que por
 * tanto no están en ningún arqueo.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Printer } from "lucide-react";
import {
  DIFFERENCE_TONE_CLASS,
  differenceTone,
  fmtDate,
  fmtDateTime,
  formatPEN,
  formatSignedPEN,
  patientName,
  type CashShift,
  type ShiftPayment,
} from "./types";

interface Props {
  shifts: CashShift[];
  authors: Record<string, string>;
  tolerance: number;
  /** Pagos sin turno posteriores a la activación del módulo. */
  orphanPayments: ShiftPayment[];
  /** Turno abierto al que se pueden atribuir; null si no hay ninguno. */
  openShiftId: string | null;
  attaching: string | null;
  onAttach: (paymentId: string) => void;
}

export function HistoryTab({
  shifts,
  authors,
  tolerance,
  orphanPayments,
  openShiftId,
  attaching,
  onAttach,
}: Props) {
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const people = useMemo(() => {
    const ids = [...new Set(shifts.map((s) => s.opened_by))];
    return ids
      .map((id) => ({ id, label: authors[id] ?? "—" }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [shifts, authors]);

  const filtered = useMemo(() => {
    return shifts.filter((s) => {
      if (person && s.opened_by !== person) return false;
      const day = (s.closed_at ?? s.opened_at).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [shifts, person, from, to]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, s) => {
          acc.expected += Number(s.expected_cash ?? 0);
          acc.counted += Number(s.counted_cash ?? 0);
          acc.difference += Number(s.difference_cash ?? 0);
          return acc;
        },
        { expected: 0, counted: 0, difference: 0 }
      ),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Persona
          </label>
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todas</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Desde
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hasta
          </label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            No hay turnos cerrados con esos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Cierre</th>
                  <th className="px-4 py-2.5">Abrió</th>
                  <th className="px-4 py-2.5 text-right">Esperado</th>
                  <th className="px-4 py-2.5 text-right">Contado</th>
                  <th className="px-4 py-2.5 text-right">Diferencia</th>
                  <th className="px-4 py-2.5">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((s) => {
                  const tone = differenceTone(s.difference_cash, tolerance);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {fmtDateTime(s.closed_at)}
                        {s.force_closed && (
                          <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                            forzado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{authors[s.opened_by] ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {formatPEN(s.expected_cash ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {formatPEN(s.counted_cash ?? 0)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold ${DIFFERENCE_TONE_CLASS[tone]}`}
                      >
                        {formatSignedPEN(s.difference_cash ?? 0)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                        {s.difference_reason ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 text-sm font-bold">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {filtered.length} turno{filtered.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatPEN(totals.expected)}</td>
                  <td className="px-4 py-2.5 text-right">{formatPEN(totals.counted)}</td>
                  <td
                    className={`px-4 py-2.5 text-right ${
                      DIFFERENCE_TONE_CLASS[differenceTone(totals.difference, tolerance)]
                    }`}
                  >
                    {formatSignedPEN(totals.difference)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Bandeja "Fuera de turno" ───────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="border-b border-border/40 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Fuera de turno
            {orphanPayments.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                {orphanPayments.length}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Cobros que entraron sin caja abierta. No están en ningún arqueo
            hasta que se atribuyan a un turno.
          </p>
        </div>
        {orphanPayments.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Todos los cobros están dentro de un turno.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {orphanPayments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {patientName(p) ?? "Cobro"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {fmtDate(p.created_at)} ·{" "}
                    {p.payment_method?.trim() || "Sin método declarado"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold">
                  {formatPEN(Number(p.amount))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 print:hidden"
                  disabled={!openShiftId || attaching === p.id}
                  onClick={() => onAttach(p.id)}
                >
                  {attaching === p.id ? "Atribuyendo…" : "Atribuir al turno abierto"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {orphanPayments.length > 0 && !openShiftId && (
          <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
            Abre una caja para poder atribuirlos: un pago nunca se adjunta a un
            turno ya cerrado.
          </p>
        )}
      </div>
    </div>
  );
}
