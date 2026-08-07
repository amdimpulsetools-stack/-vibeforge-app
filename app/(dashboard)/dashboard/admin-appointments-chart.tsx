"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/**
 * Serie diaria de citas del dashboard admin (últimos 30 días).
 *
 * Vive en su propio módulo porque es el ÚNICO consumidor de recharts
 * (~90-110 kB gz) del dashboard admin. admin-dashboard.tsx lo carga con
 * next/dynamic reservando exactamente los 200 px de alto del chart, así que
 * no hay ni un píxel de layout shift mientras baja el chunk.
 *
 * El markup y todas las props del chart son idénticos a los que estaban
 * inline en admin-dashboard.tsx.
 */
export interface DailyPoint {
  date: string;
  count: number;
}

export function AdminAppointmentsChart({
  dailySeries,
  accent,
  isEs,
}: {
  dailySeries: DailyPoint[];
  accent: string;
  isEs: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart
        data={dailySeries}
        margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
          opacity={0.4}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
          tickFormatter={(d: string) => {
            const [, m, day] = d.split("-");
            return `${parseInt(day, 10)}/${parseInt(m, 10)}`;
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as DailyPoint;
            const date = new Date(d.date + "T12:00:00");
            const label = date.toLocaleDateString(isEs ? "es-PE" : "en-US", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                <p className="text-xs font-semibold capitalize">{label}</p>
                <p className="text-xs text-emerald-500 font-medium">
                  {d.count} {isEs ? (d.count === 1 ? "cita" : "citas") : (d.count === 1 ? "appt" : "appts")}
                </p>
              </div>
            );
          }}
          cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={accent}
          strokeWidth={2}
          fill="url(#areaGrad)"
          animationDuration={800}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 4, fill: accent, stroke: "white", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
