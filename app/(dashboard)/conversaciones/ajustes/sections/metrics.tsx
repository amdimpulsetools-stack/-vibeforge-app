"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { inboxKeys } from "../../use-inbox";
import { Hint, INTENT_LABEL, Loading, LoadFailed, SectionHeader } from "./shared";

/**
 * Medición (mig 280): ¿funciona la fórmula? Una llamada al RPC
 * wa_inbox_metrics (solo admin) con cuentas y tiempos; nunca texto de
 * mensajes. "Con IA" = el chat tuvo al menos una sugerencia usada: es
 * correlación, no causa, y la pantalla lo dice.
 */

interface Metrics {
  period_days: number;
  conversations: { new: number; scheduled: number; attended: number; open: number; from_ads: number };
  ai_vs_human: { with_ai: { n: number; scheduled: number }; without_ai: { n: number; scheduled: number } };
  suggestions: {
    generated: number;
    used: number;
    thumbs_up: number;
    thumbs_down: number;
    edited: number;
    needs_human: number;
    alarms: number;
    gaps: number;
    avg_latency_ms: number | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
  };
  by_model: Array<{ model: string; n: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }>;
  intents: Array<{ intent: string; n: number }>;
  response: { measured: number; answered: number; median_minutes: number | null; p90_minutes: number | null; within_1h: number };
  kb: { entries: number; cases: number; candidates_pending: number; gaps_open: number };
  weekly: Array<{ week: string; conversations: number; scheduled: number; suggestions: number }>;
}

/** USD por millón de tokens (Anthropic, oct-2026); lectura de caché ≈ 0,1× la entrada. */
const PRICE: Record<string, { inUsd: number; outUsd: number }> = {
  "claude-haiku-4-5": { inUsd: 1, outUsd: 5 },
  "claude-sonnet-5-5": { inUsd: 2, outUsd: 10 },
};

function useInboxMetrics(orgId: string | null, days: number) {
  return useQuery({
    queryKey: [...inboxKeys.metrics(orgId), days],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc("wa_inbox_metrics", { p_org: orgId as string, p_days: days });
      if (error) {
        if (error.code === "42883") throw new PostgrestLoadError("Medición", { ...error, message: "Falta aplicar la migración 280" });
        throw new PostgrestLoadError("Medición", error);
      }
      return data as Metrics;
    },
  });
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);
const fmtPct = (v: number | null) => (v === null ? "—" : `${v} %`);
const fmtMin = (m: number | null) => {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 24) return `${(m / 60).toFixed(1)} h`;
  return `${(m / 60 / 24).toFixed(1)} d`;
};

export default function MetricsSection() {
  const { organizationId } = useOrganization();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const q = useInboxMetrics(organizationId, days);

  const cost = useMemo(() => {
    if (!q.data) return null;
    let usd = 0;
    for (const m of q.data.by_model) {
      const p = PRICE[m.model];
      if (!p) continue;
      usd += ((m.input_tokens - m.cache_read_tokens) * p.inUsd + m.cache_read_tokens * p.inUsd * 0.1 + m.output_tokens * p.outUsd) / 1_000_000;
    }
    return usd;
  }, [q.data]);

  if (q.error) return <LoadFailed error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <Loading />;
  const m = q.data;
  const c = m.conversations;
  const s = m.suggestions;
  const ai = m.ai_vs_human;
  const r = m.response;
  const maxWeek = Math.max(1, ...m.weekly.map((w) => Math.max(w.conversations, w.scheduled)));

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Medición"
        description="¿Está funcionando la fórmula? Cuántos chats terminan en cita, qué pasa con las sugerencias de Yendy y cuánto tarda el equipo en responder. Solo cuentas y tiempos: nunca el texto de los mensajes."
        action={
          <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Período">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={cn("rounded-md px-2.5 py-1", days === d ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                {d} días
              </button>
            ))}
          </div>
        }
      />

      {/* ── Resultado ── */}
      <Group title="Resultado">
        <Tile label="Chats nuevos" value={String(c.new)} hint={c.from_ads > 0 ? `${c.from_ads} llegaron por anuncio` : undefined} />
        <Tile label="Agendaron" value={fmtPct(pct(c.scheduled, c.new))} hint={`${c.scheduled} de ${c.new}`} tone="primary" />
        <Tile label="Asistieron" value={fmtPct(pct(c.attended, c.new))} hint={`${c.attended} de ${c.new}`} />
        <Tile label="Siguen abiertos" value={String(c.open)} />
      </Group>

      {/* ── Con IA vs sin IA ── */}
      <Group title="Chats con Yendy vs. sin Yendy">
        <Tile label="Con sugerencia usada" value={fmtPct(pct(ai.with_ai.scheduled, ai.with_ai.n))} hint={`agendaron ${ai.with_ai.scheduled} de ${ai.with_ai.n}`} tone="primary" />
        <Tile label="Sin IA" value={fmtPct(pct(ai.without_ai.scheduled, ai.without_ai.n))} hint={`agendaron ${ai.without_ai.scheduled} de ${ai.without_ai.n}`} />
        <div className="col-span-2 self-center text-xs text-muted-foreground">
          Es una comparación, no una causa: recepción suele pedir ayuda a Yendy en los chats más difíciles. Con pocas decenas de chats, las diferencias pequeñas no significan nada todavía.
        </div>
      </Group>

      {/* ── Yendy ── */}
      <Group title="Sugerencias de Yendy">
        <Tile label="Generadas" value={String(s.generated)} hint={s.avg_latency_ms ? `≈ ${(s.avg_latency_ms / 1000).toFixed(1)} s cada una` : undefined} />
        <Tile label="Usadas" value={fmtPct(pct(s.used, s.generated))} hint={`${s.used} pasaron al cuadro de texto`} tone="primary" />
        <Tile label="Editadas antes de enviar" value={fmtPct(pct(s.edited, s.used))} hint="recepción cambió el texto" />
        <Tile
          label="Pulgares"
          value={`${s.thumbs_up} 👍 · ${s.thumbs_down} 👎`}
          hint={s.thumbs_up + s.thumbs_down > 0 ? `${pct(s.thumbs_up, s.thumbs_up + s.thumbs_down)} % positivos` : "sin valoraciones aún"}
        />
        <Tile label="Pidieron revisión humana" value={String(s.needs_human)} hint={s.alarms > 0 ? `${s.alarms} con señal de alarma` : undefined} />
        <Tile label="Brechas detectadas" value={String(s.gaps)} hint={`${m.kb.gaps_open} abiertas en total`} />
        <Tile label="Costo estimado" value={cost === null ? "—" : `US$ ${cost.toFixed(2)}`} hint={`${((s.input_tokens + s.output_tokens) / 1000).toFixed(0)} k tokens · ${pct(s.cache_read_tokens, s.input_tokens) ?? 0} % de caché`} />
        <Tile label="Base de conocimientos" value={`${m.kb.entries} fichas · ${m.kb.cases} casos`} hint={m.kb.candidates_pending > 0 ? `${m.kb.candidates_pending} candidatos por revisar` : "sin candidatos pendientes"} />
      </Group>

      {/* ── Respuesta ── */}
      <Group title="Tiempo de primera respuesta">
        <Tile label="Mediana" value={fmtMin(r.median_minutes)} hint={`sobre ${r.answered} chats respondidos`} tone="primary" />
        <Tile label="Percentil 90" value={fmtMin(r.p90_minutes)} hint="9 de cada 10 respondidos antes de" />
        <Tile label="Respondidos en 1 h" value={fmtPct(pct(r.within_1h, r.measured))} hint={`${r.within_1h} de ${r.measured}`} />
        <Tile label="Sin respuesta" value={String(r.measured - r.answered)} hint="primer mensaje del período sin contestar" tone={r.measured - r.answered > 0 ? "warn" : undefined} />
      </Group>

      {/* ── Intenciones ── */}
      {m.intents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Por qué escriben (según Yendy)</h3>
          <ul className="space-y-1.5">
            {m.intents.map((i) => {
              const total = m.intents.reduce((a, b) => a + b.n, 0);
              return (
                <li key={i.intent} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 text-muted-foreground">{INTENT_LABEL[i.intent] ?? i.intent}</span>
                  <span className="h-2 rounded-sm bg-primary/70" style={{ width: `${Math.max(2, (i.n / total) * 100)}%` }} aria-hidden />
                  <span className="tabular-nums">{i.n}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Semanas ── */}
      {m.weekly.length > 1 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Semana a semana</h3>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${m.weekly.length}, minmax(0, 1fr))` }}>
            {m.weekly.map((w) => (
              <div key={w.week} className="flex flex-col items-center gap-1" title={`Semana del ${w.week}: ${w.conversations} chats nuevos, ${w.scheduled} citas, ${w.suggestions} sugerencias`}>
                <div className="flex h-24 w-full items-end justify-center gap-0.5">
                  <div className="w-2/5 rounded-t-sm bg-muted-foreground/30" style={{ height: `${(w.conversations / maxWeek) * 100}%` }} aria-hidden />
                  <div className="w-2/5 rounded-t-sm bg-primary/80" style={{ height: `${(w.scheduled / maxWeek) * 100}%` }} aria-hidden />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{w.week.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-muted-foreground/30" /> Chats nuevos</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-primary/80" /> Citas</span>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver tabla</summary>
            <table className="mt-1 w-full text-left">
              <thead className="text-muted-foreground">
                <tr><th className="py-0.5 font-medium">Semana</th><th className="font-medium">Chats</th><th className="font-medium">Citas</th><th className="font-medium">Sugerencias</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {m.weekly.map((w) => (
                  <tr key={w.week}><td className="py-0.5">{w.week}</td><td>{w.conversations}</td><td>{w.scheduled}</td><td>{w.suggestions}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      <Hint>
        <BarChart3 className="mr-1 inline h-3.5 w-3.5" /> "Agendó" y "Asistió" los estampa la agenda sola (mig 278) sobre chats con actividad reciente. Las sugerencias de "Probar Yendy" no cuentan. Los costos son una estimación con la lista de precios pública de Anthropic.
      </Hint>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{children}</div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "primary" | "warn" }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card px-3 py-2.5", tone === "primary" && "border-primary/40 bg-primary/5", tone === "warn" && "border-amber-400/50 bg-amber-500/5")}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums tracking-tight", tone === "primary" && "text-primary")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
