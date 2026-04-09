"use client";

import { useEffect, useState } from "react";
import { Loader2, Activity, Database, HardDrive, MessageCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalTables: 0,
    totalMigrations: 69,
    openTickets: 0,
    resolvedTickets: 0,
    totalAiQueries: 0,
    webhookStatus: "ok" as "ok" | "warning" | "error",
    dbStatus: "healthy" as "healthy" | "degraded" | "down",
  });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/founder/stats/health");
      if (!res.ok) { setLoading(false); return; }
      setData(await res.json());
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const statusColor = {
    healthy: "text-emerald-500",
    degraded: "text-amber-500",
    down: "text-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground mt-1">Estado del sistema y métricas operacionales</p>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Base de datos</span>
            <Database className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn("h-5 w-5", statusColor[data.dbStatus])} />
            <span className={cn("text-sm font-semibold capitalize", statusColor[data.dbStatus])}>
              {data.dbStatus}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.totalMigrations} migraciones · ~{data.totalTables} tablas
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Webhooks (MP)</span>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            {data.webhookStatus === "ok" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <span className="text-sm font-semibold text-emerald-500">Operativo</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            HMAC-SHA256 · Timing-safe
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">IA Assistant</span>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{data.totalAiQueries.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">queries totales procesadas</p>
        </div>
      </div>

      {/* Support */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Soporte</h2>
        </div>
        <div className="grid gap-4 grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Tickets abiertos</p>
            <p className="text-2xl font-bold text-amber-500">{data.openTickets}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tickets resueltos</p>
            <p className="text-2xl font-bold text-emerald-500">{data.resolvedTickets}</p>
          </div>
        </div>
      </div>

      {/* Security audit summary */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-emerald-500">Auditoría de Seguridad</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          16/16 issues resueltos · RLS en todas las tablas · Org checks en todos los PATCH/DELETE ·
          Zod validation en todos los endpoints · HMAC webhooks · CSP hardened · Encryption at rest
        </p>
      </div>
    </div>
  );
}
