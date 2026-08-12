"use client";

import { useEffect, useState } from "react";
import { founderFetch } from "@/lib/founder-fetch";
import {
  Loader2,
  Activity,
  Clock,
  MessageCircle,
  Mail,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SystemSubNav } from "../subnav";

/* Espejo del payload de /api/founder/stats/health (versión real, sin
   hardcodes — antes esta página mostraba "webhook ok" escrito en el
   código aunque el fetch fallara). */
interface HealthPayload {
  crons: {
    name: string;
    label: string;
    status: "ok" | "error" | "atrasado" | "sin_registro";
    last_run: string | null;
    hours_since: number | null;
  }[];
  paused_crons: { name: string; label: string; reason: string }[];
  einvoices_bad_7d: number;
  whatsapp_failed_7d: number;
  wa_captured_24h: number;
  email_reminders_failed_7d: number;
  recent_billing_events: { event_type: string; created_at: string }[];
  open_tickets: { subject: string; priority: string; hours_open: number }[];
  generated_at: string;
}

const CRON_STATUS: Record<
  HealthPayload["crons"][number]["status"],
  { label: string; cls: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: "OK", cls: "text-emerald-500", icon: CheckCircle2 },
  atrasado: { label: "Atrasado >36h", cls: "text-red-500", icon: AlertTriangle },
  error: { label: "Última corrida falló", cls: "text-red-500", icon: AlertTriangle },
  sin_registro: {
    label: "Sin registro aún",
    cls: "text-muted-foreground",
    icon: Clock,
  },
};

export default function HealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    founderFetch<HealthPayload>("/api/founder/stats/health")
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Error"));
  }, []);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudo cargar Health</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reintentar</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Activity className="h-6 w-6 text-amber-500" /> Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Operación técnica real — crons, mensajería, SUNAT y billing. Nada
          decorativo: todo sale de la base.
        </p>
      </div>
      <SystemSubNav />

      {/* Fallos 7d */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FailCard
          icon={Receipt}
          label="Comprobantes SUNAT rechazados (7d)"
          value={data.einvoices_bad_7d}
        />
        <FailCard
          icon={MessageCircle}
          label="WhatsApps fallidos (7d)"
          value={data.whatsapp_failed_7d}
        />
        <FailCard
          icon={Mail}
          label="Emails de recordatorio fallidos (7d)"
          value={data.email_reminders_failed_7d}
        />
        {/* Captación: informativa, no de fallo — un capturador sano con
            campañas activas nunca debería marcar 0 dos días seguidos. */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApps entrantes capturados (24h)
          </div>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">
            {data.wa_captured_24h}
          </p>
        </div>
      </div>

      {/* Crons */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Crons diarios
        </h2>
        <ul className="divide-y divide-border/40">
          {data.crons.map((c) => {
            const st = CRON_STATUS[c.status];
            const Icon = st.icon;
            return (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{c.label}</span>
                <span className={cn("flex items-center gap-1.5 text-xs font-medium", st.cls)}>
                  <Icon className="h-3.5 w-3.5" />
                  {st.label}
                  {c.hours_since != null && c.status === "ok" && (
                    <span className="text-muted-foreground">· hace {c.hours_since}h</span>
                  )}
                </span>
              </li>
            );
          })}
          {data.paused_crons.map((c) => (
            <li key={c.name} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <span>{c.label}</span>
              <span
                className="flex max-w-[50%] items-start gap-1.5 text-right text-xs font-medium text-amber-500"
                title={c.reason}
              >
                <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Pausado a propósito
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          &quot;Sin registro aún&quot; = cron no instrumentado con cron_runs (mig 204) o sin
          corrida desde el deploy. Los instrumentados hoy: billing, recordatorios y
          fertilidad (reactivado 2026-08-08 — vigilar sus primeras corridas).
        </p>
      </div>

      {/* Actividad de billing (evidencia del webhook MP) */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Actividad de billing reciente
        </h2>
        {data.recent_billing_events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
        ) : (
          <ul className="divide-y divide-border/40 text-sm">
            {data.recent_billing_events.map((e, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <code className="text-xs">{e.event_type}</code>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("es-PE")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tickets */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Headphones className="h-4 w-4" /> Tickets abiertos ({data.open_tickets.length})
          <a
            href="/founder-dashboard/support"
            className="ml-auto text-xs font-medium normal-case tracking-normal text-primary hover:underline"
          >
            Ir a la bandeja →
          </a>
        </h2>
        {data.open_tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tickets pendientes. 🎉</p>
        ) : (
          <ul className="divide-y divide-border/40 text-sm">
            {data.open_tickets.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">{t.subject || "Sin asunto"}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    t.hours_open > 48 ? "font-semibold text-red-500" : "text-muted-foreground"
                  )}
                >
                  {t.hours_open}h abierto
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Generado {new Date(data.generated_at).toLocaleString("es-PE")}
      </p>
    </div>
  );
}

function FailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        value > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/60 bg-card"
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={cn("mt-1.5 text-2xl font-extrabold", value > 0 && "text-red-500")}>
        {value}
      </p>
    </div>
  );
}
