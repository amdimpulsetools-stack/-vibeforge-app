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
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { FileText, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrgToday } from "@/hooks/use-org-today";
import { todayInTz } from "@/lib/org-time";
import { cn } from "@/lib/utils";
import { OrphanTray } from "./orphan-tray";
import {
  DIFFERENCE_TONE_CLASS,
  differenceTone,
  fmtDateTime,
  formatPEN,
  formatSignedPEN,
  type CashShift,
  type ShiftPayment,
} from "./types";

/** Tope del reporte impreso (mismo que /caja/reporte). */
const REPORT_MAX_SHIFTS = 60;
const PAGE = 1000; // max-rows de PostgREST
const IDS_PER_QUERY = 50; // URL corta

/**
 * Ingresos / egresos por turno para la tabla. Solo dos columnas por fila
 * (turno, monto) y en trozos: liviano aunque haya cientos de turnos. Se
 * carga solo con esta pestaña abierta (solo administración).
 */
async function fetchFlows(ids: string[]): Promise<Record<string, { income: number; outflow: number }>> {
  const supabase = createClient();
  const out: Record<string, { income: number; outflow: number }> = {};
  const add = (id: string | null, amount: number) => {
    if (!id) return;
    const o = (out[id] ??= { income: 0, outflow: 0 });
    if (amount >= 0) o.income += amount;
    else o.outflow += -amount;
  };
  async function all(table: "patient_payments" | "cash_movements", col: string, chunk: string[]) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(`${col},amount`)
        .in(col, chunk)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const r of rows) add(r[col] as string | null, Number(r.amount));
      if (rows.length < PAGE) break;
    }
  }
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + IDS_PER_QUERY);
    await Promise.all([all("patient_payments", "cash_shift_id", chunk), all("cash_movements", "shift_id", chunk)]);
  }
  return out;
}

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
  const { timezone } = useOrgToday();
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
      // Día civil de la clínica (no UTC: un cierre a las 20:00 en Lima es
      // del mismo día, no del siguiente).
      const day = todayInTz(timezone, new Date(s.closed_at ?? s.opened_at));
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [shifts, person, from, to, timezone]);

  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const flowsQuery = useQuery({
    queryKey: ["caja", "historial-flujos", filteredIds.join(",")],
    enabled: filteredIds.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchFlows(filteredIds),
  });
  const flows = flowsQuery.data;
  const flowTotals = useMemo(() => {
    if (!flows) return null;
    return filteredIds.reduce(
      (acc, id) => {
        acc.income += flows[id]?.income ?? 0;
        acc.outflow += flows[id]?.outflow ?? 0;
        return acc;
      },
      { income: 0, outflow: 0 },
    );
  }, [flows, filteredIds]);
  const reportHref =
    filteredIds.length > 0 && filteredIds.length <= REPORT_MAX_SHIFTS
      ? `/caja/reporte?turnos=${filteredIds.join(",")}`
      : null;
  const flowCell = (id: string, key: "income" | "outflow") =>
    flowsQuery.isError ? "—" : flows ? formatPEN(flows[id]?.[key] ?? 0) : "…";

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
        {reportHref ? (
          <Link
            href={reportHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            <Printer className="h-4 w-4" /> Imprimir reporte ({filteredIds.length})
          </Link>
        ) : filteredIds.length > REPORT_MAX_SHIFTS ? (
          <span className="text-xs text-muted-foreground">
            Para imprimir, acota a {REPORT_MAX_SHIFTS} turnos o menos (hay {filteredIds.length}).
          </span>
        ) : null}
      </div>
      {flowsQuery.isError && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          No se pudieron calcular los ingresos y egresos por turno. Los turnos no se han perdido; recarga la página para reintentar.
        </p>
      )}

      <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            No hay turnos cerrados con esos filtros.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Cierre</th>
                  <th className="px-4 py-2.5">Abrió</th>
                  <th className="px-4 py-2.5 text-right">Ingresos</th>
                  <th className="px-4 py-2.5 text-right">Egresos</th>
                  <th className="px-4 py-2.5 text-right">Esperado</th>
                  <th className="px-4 py-2.5 text-right">Contado</th>
                  <th className="px-4 py-2.5 text-right">Diferencia</th>
                  <th className="px-4 py-2.5">Motivo</th>
                  <th className="px-4 py-2.5 print:hidden" />
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
                      <td className="px-4 py-2.5 text-right tabular-nums text-success-600 dark:text-success-400">
                        {flowCell(s.id, "income")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                        {flowCell(s.id, "outflow")}
                      </td>
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
                      <td className="px-4 py-2.5 text-right print:hidden">
                        <Link
                          href={`/caja/reporte?turnos=${s.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" /> Ver / Imprimir
                        </Link>
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
                  <td className={cn("px-4 py-2.5 text-right tabular-nums text-success-600 dark:text-success-400")}>
                    {flowTotals ? formatPEN(flowTotals.income) : "…"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                    {flowTotals ? formatPEN(flowTotals.outflow) : "…"}
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
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Bandeja "Fuera de turno" ───────────────────────────────────── */}
      <OrphanTray
        orphanPayments={orphanPayments}
        openShiftId={openShiftId}
        attaching={attaching}
        onAttach={onAttach}
      />
    </div>
  );
}
