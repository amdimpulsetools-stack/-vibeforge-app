"use client";

/**
 * Reporte de turno(s) de caja: TODO lo que entró y salió del cajón, con el
 * cuadre. Pensado para papel: la barra lateral y el topbar ya son
 * `print:hidden`, y globals.css fuerza fondo blanco / texto negro al
 * imprimir. El navegador lo guarda como PDF ("Guardar como PDF").
 *
 * Los números NO se recalculan: esperado, contado, diferencia y fondo son
 * los que guardó el cierre (caja_close_shift) en cash_shifts. Lo único que
 * se suma aquí son las filas que se listan (total de la tabla que se ve).
 * Cobros clínicos y ventas de farmacia (source='pos') van en tablas
 * separadas (CLAUDE.md: plata clínica y de farmacia nunca se mezclan).
 */

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { Button } from "@/components/ui/button";
import {
  DataLoadError,
  PostgrestLoadError,
  useReportLoadError,
} from "../../scheduler/data-load-error";
import {
  MOVEMENT_COLUMNS,
  MOVEMENT_LABEL,
  NO_METHOD,
  REASON_LABEL,
  SHIFT_COLUMNS,
  formatPEN,
  formatSignedPEN,
  type CashMovement,
  type CashShift,
} from "../types";

interface ReportPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  tender_kind: string | null;
  source: string | null;
  created_at: string;
  created_by: string | null;
  cash_shift_id: string | null;
  notes: string | null;
  patients: { first_name: string; last_name: string } | null;
}

const REPORT_PAYMENT_COLUMNS =
  "id,amount,payment_method,tender_kind,source,created_at,created_by,cash_shift_id,notes," +
  "patients(first_name,last_name)";

interface ReportData {
  shifts: CashShift[];
  payments: ReportPayment[];
  movements: CashMovement[];
  people: Record<string, string>;
}

async function loadReport(ids: string[]): Promise<ReportData> {
  const supabase = createClient();
  const [shiftRes, payRes, movRes] = await Promise.all([
    supabase.from("cash_shifts").select(SHIFT_COLUMNS).in("id", ids).order("opened_at", { ascending: true }),
    supabase
      .from("patient_payments")
      .select(REPORT_PAYMENT_COLUMNS)
      .in("cash_shift_id", ids)
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("cash_movements")
      .select(MOVEMENT_COLUMNS)
      .in("shift_id", ids)
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);
  if (shiftRes.error) throw new PostgrestLoadError("Caja (turnos)", shiftRes.error);
  if (payRes.error) throw new PostgrestLoadError("Caja (cobros)", payRes.error);
  if (movRes.error) throw new PostgrestLoadError("Caja (movimientos)", movRes.error);

  const shifts = (shiftRes.data ?? []) as unknown as CashShift[];
  const payments = (payRes.data ?? []) as unknown as ReportPayment[];
  const movements = (movRes.data ?? []) as unknown as CashMovement[];

  const personIds = [
    ...new Set(
      [
        ...shifts.flatMap((s) => [s.opened_by, s.closed_by]),
        ...movements.map((m) => m.created_by),
        ...payments.map((p) => p.created_by),
      ].filter(Boolean) as string[],
    ),
  ];
  const people: Record<string, string> = {};
  if (personIds.length > 0) {
    // Nombres: solo decorativo. Si falla, el reporte sale con "—".
    const { data } = await supabase.from("user_profiles").select("id,full_name,email").in("id", personIds);
    for (const r of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      const label = r.full_name?.trim() || r.email?.trim();
      if (label) people[r.id] = label;
    }
  }
  return { shifts, payments, movements, people };
}

export function ShiftReport({ ids, truncated }: { ids: string[]; truncated: boolean }) {
  const { organization } = useOrganization();
  const { timezone } = useOrgToday();
  const query = useQuery({
    queryKey: ["caja", "reporte", ids.join(",")],
    enabled: ids.length > 0,
    retry: 1,
    staleTime: 60_000,
    queryFn: () => loadReport(ids),
  });
  useReportLoadError(query.error, { area: "caja", query: "reporte_turno" });

  const fmt = useMemo(() => {
    const dt = new Intl.DateTimeFormat("es-PE", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const t = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
    const d = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "2-digit" });
    return {
      dateTime: (iso: string | null) => (iso ? dt.format(new Date(iso)) : "—"),
      time: (iso: string) => t.format(new Date(iso)),
      dayTime: (iso: string) => `${d.format(new Date(iso))} ${t.format(new Date(iso))}`,
    };
  }, [timezone]);

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link href="/caja" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a Caja
      </Link>
      <Button onClick={() => window.print()} disabled={!query.data}>
        <Printer className="h-4 w-4" /> Imprimir / Guardar PDF
      </Button>
    </div>
  );

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {toolbar}
        <p className="text-sm text-muted-foreground">No se indicó ningún turno para el reporte.</p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {toolbar}
        <DataLoadError
          title="No se pudo cargar el reporte de caja."
          description="Los movimientos no se han perdido. Reintenta en un momento."
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {toolbar}
        <p className="text-sm text-muted-foreground">Cargando reporte…</p>
      </div>
    );
  }

  const { shifts, payments, movements, people } = query.data;
  const who = (id: string | null | undefined) => (id ? people[id] ?? "—" : "—");
  const perShift = shifts.map((s) => buildShift(s, payments, movements));
  const multi = perShift.length > 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 text-sm print:max-w-none print:px-0 print:py-0 print:text-[11px]">
      {toolbar}
      {truncated && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 print:hidden">
          Se muestran solo los primeros turnos. Acota las fechas para ver el resto.
        </p>
      )}
      {shifts.length < ids.length && (
        <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground print:hidden">
          {ids.length - shifts.length} turno(s) no se muestran (no existen o no tienes acceso).
        </p>
      )}

      <header className="border-b border-border pb-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Reporte de caja</p>
        <h1 className="text-xl font-bold">{organization?.name ?? "Clínica"}</h1>
        <p className="text-xs text-muted-foreground">
          {multi ? `${perShift.length} turnos` : "1 turno"} · generado el {fmt.dateTime(new Date().toISOString())}
        </p>
      </header>

      {multi && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Resumen de turnos</h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2">Turno</th>
                <th className="py-1.5 pr-2">Abrió</th>
                <th className="py-1.5 pr-2 text-right">Ingresos</th>
                <th className="py-1.5 pr-2 text-right">Egresos</th>
                <th className="py-1.5 pr-2 text-right">Esperado (efectivo)</th>
                <th className="py-1.5 pr-2 text-right">Contado</th>
                <th className="py-1.5 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {perShift.map(({ shift, totals }) => (
                <tr key={shift.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{fmt.dayTime(shift.opened_at)}</td>
                  <td className="py-1.5 pr-2">{who(shift.opened_by)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatPEN(totals.income)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatPEN(totals.outflow)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {shift.expected_cash != null ? formatPEN(shift.expected_cash) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {shift.counted_cash != null ? formatPEN(shift.counted_cash) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">
                    {shift.difference_cash != null ? formatSignedPEN(shift.difference_cash) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="py-1.5 pr-2" colSpan={2}>Total</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatPEN(perShift.reduce((a, x) => a + x.totals.income, 0))}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatPEN(perShift.reduce((a, x) => a + x.totals.outflow, 0))}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatPEN(perShift.reduce((a, x) => a + Number(x.shift.expected_cash ?? 0), 0))}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatPEN(perShift.reduce((a, x) => a + Number(x.shift.counted_cash ?? 0), 0))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatSignedPEN(perShift.reduce((a, x) => a + Number(x.shift.difference_cash ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {perShift.map((x) => (
        <ShiftSection
          key={x.shift.id}
          data={x}
          who={who}
          fmt={fmt}
          breakBefore={multi}
        />
      ))}
    </div>
  );
}

// ── Un turno ─────────────────────────────────────────────────────────────

type ShiftData = ReturnType<typeof buildShift>;

function buildShift(shift: CashShift, allPayments: ReportPayment[], allMovements: CashMovement[]) {
  const payments = allPayments.filter((p) => p.cash_shift_id === shift.id);
  const clinical = payments.filter((p) => (p.source ?? "clinical") !== "pos");
  const pos = payments.filter((p) => (p.source ?? "clinical") === "pos");
  const movements = allMovements.filter((m) => m.shift_id === shift.id);
  // Los movimientos se guardan con signo (egreso/sangría/devolución < 0).
  const otherIncome = movements.filter((m) => Number(m.amount) > 0);
  const outflows = movements.filter((m) => Number(m.amount) < 0);

  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + Number(r.amount), 0);
  const byMethod = new Map<string, number>();
  for (const p of payments) {
    const k = p.payment_method?.trim() || NO_METHOD;
    byMethod.set(k, (byMethod.get(k) ?? 0) + Number(p.amount));
  }

  const totals = {
    clinical: sum(clinical),
    pos: sum(pos),
    otherIncome: sum(otherIncome),
    outflow: Math.abs(sum(outflows)),
    income: sum(payments) + sum(otherIncome),
  };
  return { shift, clinical, pos, otherIncome, outflows, byMethod, totals };
}

interface Fmt {
  dateTime: (iso: string | null) => string;
  time: (iso: string) => string;
  dayTime: (iso: string) => string;
}

function ShiftSection({
  data,
  who,
  fmt,
  breakBefore,
}: {
  data: ShiftData;
  who: (id: string | null | undefined) => string;
  fmt: Fmt;
  breakBefore: boolean;
}) {
  const { shift, clinical, pos, otherIncome, outflows, byMethod, totals } = data;
  const patient = (p: ReportPayment) =>
    p.patients ? `${p.patients.first_name ?? ""} ${p.patients.last_name ?? ""}`.trim() || "—" : "—";
  const movLabel = (m: CashMovement) =>
    `${MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}${
      m.reason_code ? ` · ${REASON_LABEL[m.reason_code] ?? m.reason_code}` : ""
    }`;

  return (
    <section className={breakBefore ? "space-y-4 break-before-page pt-2" : "space-y-4"}>
      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Turno de {who(shift.opened_by)}</h2>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {shift.status === "open" ? "Abierto" : shift.force_closed ? "Cerrado (forzado)" : "Cerrado"}
          </span>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Item k="Apertura" v={fmt.dateTime(shift.opened_at)} />
          <Item k="Cierre" v={fmt.dateTime(shift.closed_at)} />
          <Item k="Cerró" v={who(shift.closed_by)} />
          <Item k="Fondo inicial" v={formatPEN(shift.opening_float)} />
        </dl>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Ingresos" value={formatPEN(totals.income)} tone="in" />
        <Stat label="Egresos" value={formatPEN(totals.outflow)} tone="out" />
        <Stat
          label="Esperado (efectivo)"
          value={shift.expected_cash != null ? formatPEN(shift.expected_cash) : "—"}
        />
        <Stat
          label="Diferencia"
          value={shift.difference_cash != null ? formatSignedPEN(shift.difference_cash) : "—"}
        />
      </div>

      {/* Ingresos */}
      <Block title="Ingresos · cobros clínicos" total={totals.clinical} empty="Sin cobros clínicos en este turno.">
        {clinical.length > 0 && (
          <Table head={["Hora", "Paciente", "Método", "Registró", "Monto"]}>
            {clinical.map((p) => (
              <tr key={p.id} className="border-b border-border/40">
                <Td>{fmt.time(p.created_at)}</Td>
                <Td>{patient(p)}</Td>
                <Td>{p.payment_method?.trim() || NO_METHOD}</Td>
                <Td>{who(p.created_by)}</Td>
                <Td right>{formatPEN(p.amount)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Block>

      {pos.length > 0 && (
        <Block title="Ingresos · ventas de farmacia" total={totals.pos}>
          <Table head={["Hora", "Paciente", "Método", "Registró", "Monto"]}>
            {pos.map((p) => (
              <tr key={p.id} className="border-b border-border/40">
                <Td>{fmt.time(p.created_at)}</Td>
                <Td>{patient(p)}</Td>
                <Td>{p.payment_method?.trim() || NO_METHOD}</Td>
                <Td>{who(p.created_by)}</Td>
                <Td right>{formatPEN(p.amount)}</Td>
              </tr>
            ))}
          </Table>
        </Block>
      )}

      {otherIncome.length > 0 && (
        <Block title="Ingresos · otros (manuales)" total={totals.otherIncome}>
          <Table head={["Hora", "Tipo", "Nota", "Registró", "Monto"]}>
            {otherIncome.map((m) => (
              <tr key={m.id} className="border-b border-border/40">
                <Td>{fmt.time(m.created_at)}</Td>
                <Td>{movLabel(m)}</Td>
                <Td>{m.notes || "—"}</Td>
                <Td>{who(m.created_by)}</Td>
                <Td right>{formatPEN(m.amount)}</Td>
              </tr>
            ))}
          </Table>
        </Block>
      )}

      {/* Egresos */}
      <Block title="Egresos" total={totals.outflow} empty="Sin egresos en este turno.">
        {outflows.length > 0 && (
          <Table head={["Hora", "Tipo", "Nota", "Registró", "Monto"]}>
            {outflows.map((m) => (
              <tr key={m.id} className="border-b border-border/40">
                <Td>{fmt.time(m.created_at)}</Td>
                <Td>{movLabel(m)}</Td>
                <Td>{m.notes || "—"}</Td>
                <Td>{who(m.created_by)}</Td>
                <Td right>{formatPEN(Math.abs(Number(m.amount)))}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Block>

      {/* Por método */}
      {byMethod.size > 0 && (
        <Block title="Cobros por método de pago">
          <Table head={["Método", "Monto"]}>
            {[...byMethod.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <tr key={k} className="border-b border-border/40">
                  <Td>{k}</Td>
                  <Td right>{formatPEN(v)}</Td>
                </tr>
              ))}
          </Table>
        </Block>
      )}

      {/* Cuadre */}
      <Block title="Cuadre de efectivo">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Item k="Fondo inicial" v={formatPEN(shift.opening_float)} />
          <Item k="Esperado" v={shift.expected_cash != null ? formatPEN(shift.expected_cash) : "—"} />
          <Item k="Contado" v={shift.counted_cash != null ? formatPEN(shift.counted_cash) : "—"} />
          <Item k="Diferencia" v={shift.difference_cash != null ? formatSignedPEN(shift.difference_cash) : "—"} />
        </dl>
        {shift.difference_reason && (
          <p className="mt-2 text-xs"><span className="font-semibold">Motivo de la diferencia:</span> {shift.difference_reason}</p>
        )}
        {shift.closing_notes && (
          <p className="mt-1 text-xs"><span className="font-semibold">Notas del cierre:</span> {shift.closing_notes}</p>
        )}
      </Block>

      <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
        <div className="border-t border-foreground/50 pt-1">Firma de quien entrega</div>
        <div className="border-t border-foreground/50 pt-1">Firma de quien recibe</div>
      </div>
    </section>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "in" | "out" }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          "text-base font-bold tabular-nums " +
          (tone === "in" ? "text-success-600 print:text-black" : tone === "out" ? "text-red-600 print:text-black" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Block({
  title,
  total,
  empty,
  children,
}: {
  title: string;
  total?: number;
  empty?: string;
  children?: React.ReactNode;
}) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <div className="break-inside-avoid-page">
      <div className="mb-1 flex items-baseline justify-between border-b border-border pb-1">
        <h3 className="text-sm font-bold">{title}</h3>
        {total != null && <span className="text-sm font-bold tabular-nums">{formatPEN(total)}</span>}
      </div>
      {hasContent ? children : empty ? <p className="py-1 text-xs text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse text-left text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={"py-1 pr-2 font-semibold" + (i === head.length - 1 ? " text-right" : "")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={"py-1 pr-2 align-top" + (right ? " text-right tabular-nums" : "")}>{children}</td>;
}
