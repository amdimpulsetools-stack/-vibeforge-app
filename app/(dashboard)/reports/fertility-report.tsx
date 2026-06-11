"use client";

/**
 * Fertility report tab — the "tablero de conversión" the sales pitch
 * promises. Self-contained like RetentionReport: receives only the
 * date range and fetches its own aggregates from
 * /api/reports/fertility (one round-trip, server-side aggregation).
 *
 * Two consultation views, on purpose:
 *   • Pulso del rango (events): 1as y 2as completadas dentro del
 *     rango — la 2ª cuenta en el mes en que ocurrió aunque la 1ª
 *     fuera de meses atrás (retrospección).
 *   • Conversión real (cohort): % de 1as con ≥60 días de maduración
 *     (últimos 12 meses) que llegaron a su 2ª. Fija, independiente
 *     del rango, porque dividir "2as del mes / 1as del mes" mezcla
 *     cohortes y miente.
 *
 * Empty-state: if the org hasn't mapped its consultation services to
 * the canonical categories, we show a setup banner instead of zeros —
 * zeros would read as "no activity" when it's really "not configured".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  Clock,
  Hourglass,
  Receipt,
  Settings2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

interface FertilityReportData {
  consultations:
    | { mapped: false }
    | {
        mapped: true;
        firsts_in_range: number;
        seconds_in_range: number;
        median_days_first_to_second: number | null;
        pairs_measured: number;
        cohort: {
          window_months: number;
          maturity_days: number;
          /** True when the matured cohort was empty (young org) and
           * the rate was computed without the maturity filter. */
          preliminary: boolean;
          total: number;
          converted: number;
          rate_pct: number | null;
        };
      };
  budgets: {
    sent: number;
    by_asesora: { asesora: string; sent: number }[];
    unsent_backlog: number;
    accepted: number;
    rejected: number;
    acceptance_rate_pct: number | null;
    median_days_to_accept: number | null;
    pipeline_amount: number;
    accepted_amount: number;
    by_tier: { tier: "A" | "B" | "C"; sent: number; accepted: number }[];
  };
}

function formatPen(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  accent = false,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4"
          : "rounded-xl border border-border bg-card p-4"
      }
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export function FertilityReport({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const [data, setData] = useState<FertilityReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/fertility?from=${dateFrom}&to=${dateTo}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setError(err.error ?? `Error ${res.status}`);
          return;
        }
        setData((await res.json()) as FertilityReportData);
      })
      .catch(() => !cancelled && setError("Error de red"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Calculando métricas de fertilidad…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600">
        {error ?? "No se pudo cargar el reporte"}
      </div>
    );
  }

  const c = data.consultations;
  const b = data.budgets;
  const maxAsesora = Math.max(1, ...b.by_asesora.map((a) => a.sent));

  return (
    <div className="space-y-6">
      {/* ── Embudo de consultas ───────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Embudo de consultas
        </h2>

        {!c.mapped ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Falta configurar el mapeo de consultas
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Para medir la conversión 1ª → 2ª consulta, indica qué
              servicios de tu catálogo corresponden a &quot;Primera
              consulta&quot; y &quot;Segunda consulta&quot; de fertilidad.
              Es la misma configuración que usan los seguimientos
              automáticos — se hace una sola vez.
            </p>
            <Link
              href="/admin/addon-config/fertility/canonical-mapping"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurar mapeo
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={Users}
                label="Primeras consultas (rango)"
                value={String(c.firsts_in_range)}
                subtitle="Solo consultas completadas"
              />
              <KpiCard
                icon={CalendarCheck2}
                label="Segundas consultas (rango)"
                value={String(c.seconds_in_range)}
                subtitle="Solo completadas. Cuentan en el mes en que ocurren, aunque la 1ª fuera anterior"
              />
              <KpiCard
                icon={TrendingUp}
                label={
                  c.cohort.preliminary
                    ? "Conversión 1ª → 2ª (preliminar)"
                    : "Conversión 1ª → 2ª"
                }
                value={c.cohort.rate_pct != null ? `${c.cohort.rate_pct}%` : "—"}
                subtitle={
                  c.cohort.preliminary
                    ? `${c.cohort.converted} de ${c.cohort.total} pacientes. Cohorte aún madurando: las 1as consultas tienen menos de ${c.cohort.maturity_days} días — el % puede subir a medida que las pacientes recientes concreten su 2ª.`
                    : `Cohorte: ${c.cohort.converted} de ${c.cohort.total} pacientes (últimos ${c.cohort.window_months} meses, con ${c.cohort.maturity_days}+ días de maduración)`
                }
                accent
              />
              <KpiCard
                icon={Clock}
                label="Tiempo 1ª → 2ª"
                value={
                  c.median_days_first_to_second != null
                    ? `${c.median_days_first_to_second} días`
                    : "—"
                }
                subtitle={`Mediana sobre ${c.pairs_measured} pares del rango`}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              La conversión se mide por cohorte (no &quot;2as del mes ÷ 1as
              del mes&quot;) para no mezclar pacientes de meses distintos.
            </p>
          </>
        )}
      </section>

      {/* ── Presupuestos ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Presupuestos
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Receipt}
            label="Enviados (rango)"
            value={String(b.sent)}
          />
          <KpiCard
            icon={Hourglass}
            label="Pendientes de enviar (hoy)"
            value={String(b.unsent_backlog)}
            subtitle="Asignados por el doctor, aún sin despachar"
          />
          <KpiCard
            icon={TrendingUp}
            label="Aceptados (rango)"
            value={String(b.accepted)}
            subtitle={
              b.acceptance_rate_pct != null
                ? `${b.acceptance_rate_pct}% de los decididos · mediana ${b.median_days_to_accept ?? "—"} días en aceptar`
                : undefined
            }
            accent
          />
          <KpiCard
            icon={Wallet}
            label="Monto aceptado (rango)"
            value={formatPen(b.accepted_amount)}
            subtitle={`En pipeline (enviados sin respuesta): ${formatPen(b.pipeline_amount)}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Por asesora */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Enviados por asesora
            </h3>
            {b.by_asesora.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Sin presupuestos enviados en el rango.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {b.by_asesora.map((row) => (
                  <li key={row.asesora} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-xs">
                      {row.asesora}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${(row.sent / maxAsesora) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                      {row.sent}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Por paquete */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por paquete (enviados → aceptados)
            </h3>
            <ul className="mt-3 space-y-2">
              {(() => {
                // Scale against the max of BOTH metrics: "accepted in
                // range" can exceed "sent in range" (a budget sent last
                // month and accepted this month counts in accepted but
                // not in sent), so scaling by sent alone overflowed the
                // bar — the Tier A 3/1 case from user testing.
                const scaleMax = Math.max(
                  1,
                  ...b.by_tier.flatMap((t) => [t.sent, t.accepted]),
                );
                return b.by_tier.map((row) => (
                  <li key={row.tier} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-semibold">
                      Tier {row.tier}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-sky-300/70"
                        style={{ width: `${(row.sent / scaleMax) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                        style={{ width: `${(row.accepted / scaleMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {row.sent} → {row.accepted}
                    </span>
                  </li>
                ));
              })()}
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Celeste = enviados en el rango · Verde = aceptados en el
              rango (pueden superar a los enviados: un presupuesto
              enviado en un mes anterior puede aceptarse en este).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
