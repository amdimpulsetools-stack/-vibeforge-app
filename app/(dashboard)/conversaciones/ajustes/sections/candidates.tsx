"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Lightbulb, Loader2, RefreshCw, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { inboxFetch, inboxKeys, useOrgServices } from "../../use-inbox";
import { Chip, Hint, INTENT_LABEL, input, Loading, LoadFailed, SectionHeader } from "./shared";

/**
 * Casos candidatos (mig 279): la IA revisa los chats que terminaron en
 * cita (Agendó / Asistió) y propone el tramo que ayudó a cerrar. Nada
 * entra a la base de conocimientos sin que administración lo apruebe
 * (con correcciones si quiere). Al abrir esta sección se revisa lo nuevo
 * como mucho una vez por semana; "Buscar ahora" fuerza una corrida.
 */

interface Candidate {
  id: string;
  conversation_id: string;
  status: "pending" | "approved" | "rejected";
  outcome: "scheduled" | "attended";
  score: number;
  intent: string;
  service_id: string | null;
  title: string;
  patient_message: string;
  ideal_reply: string;
  guidance: string | null;
  rationale: string | null;
  created_at: string;
  decided_at: string | null;
}

interface MineResult {
  skipped: boolean;
  reviewed: number;
  proposed: number;
  remaining: "more" | 0 | null;
  failed?: number;
}

function useCandidates(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.candidates(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_case_candidates")
        .select("id, conversation_id, status, outcome, score, intent, service_id, title, patient_message, ideal_reply, guidance, rationale, created_at, decided_at")
        .eq("organization_id", orgId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if (error.code === "42P01") throw new PostgrestLoadError("Casos candidatos", { ...error, message: "Falta aplicar la migración 279" });
        throw new PostgrestLoadError("Casos candidatos", error);
      }
      return (data ?? []) as Candidate[];
    },
  });
}

export default function CandidatesSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const q = useCandidates(organizationId);
  const services = useOrgServices(organizationId);
  const [mining, setMining] = useState(false);
  const [lastRun, setLastRun] = useState<MineResult | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const autoRan = useRef(false);

  const serviceName = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s.name])), [services.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: inboxKeys.candidates(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
  };

  async function mine(auto: boolean) {
    if (mining) return;
    setMining(true);
    const res = await inboxFetch<MineResult>("/api/inbox/ai/mine", { method: "POST", body: { auto } });
    setMining(false);
    if (!res.ok) {
      if (!auto) toast.error(res.error);
      return;
    }
    setLastRun(res.data);
    if (!res.data.skipped) {
      refresh();
      if (!auto) {
        toast.success(
          res.data.reviewed === 0
            ? "No hay chats cerrados nuevos por revisar"
            : `Revisados ${res.data.reviewed} chats · ${res.data.proposed} propuesta${res.data.proposed === 1 ? "" : "s"}`,
        );
      }
    }
  }

  // Automático al abrir: el servidor lo limita a una vez por semana.
  useEffect(() => {
    if (!organizationId || autoRan.current) return;
    autoRan.current = true;
    void mine(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (q.error) return <LoadFailed error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <Loading />;

  const pending = q.data.filter((c) => c.status === "pending");
  const decided = q.data.filter((c) => c.status !== "pending");

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Casos candidatos"
        description="Yendy revisa los chats que terminaron en cita y propone el tramo donde la paciente pasó de dudar a aceptar. Tú apruebas (corrigiendo lo que quieras) o descartas: nada entra a la base sin tu visto bueno."
        action={
          <button
            type="button"
            onClick={() => void mine(false)}
            disabled={mining}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Buscar ahora
          </button>
        }
      />
      {lastRun && !lastRun.skipped && lastRun.remaining === "more" && (
        <Hint>Quedan más chats cerrados por revisar. Pulsa “Buscar ahora” otra vez (se revisan de 8 en 8 para cuidar el costo).</Hint>
      )}
      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <Lightbulb className="mx-auto mb-2 h-6 w-6" />
          {mining ? "Revisando chats cerrados…" : "Sin candidatos pendientes. Aparecen cuando un chat termina en cita (etiqueta Agendó / Asistió) y tiene un tramo que valga como ejemplo."}
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((c) => (
            <CandidateCard key={c.id} c={c} serviceName={serviceName} services={services.data ?? []} onDone={refresh} />
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDecided(!showDecided)} className="text-xs text-muted-foreground underline">
            {showDecided ? "Ocultar" : "Ver"} decididos ({decided.length})
          </button>
          {showDecided && (
            <ul className="mt-2 space-y-1.5">
              {decided.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
                  {c.status === "approved" ? <Chip tone="primary">Aprobado</Chip> : <Chip tone="muted">Descartado</Chip>}
                  <span className="line-clamp-1 flex-1">{c.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  c,
  serviceName,
  services,
  onDone,
}: {
  c: Candidate;
  serviceName: Map<string, string>;
  services: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    intent: c.intent,
    service_id: c.service_id,
    patient_message: c.patient_message,
    ideal_reply: c.ideal_reply,
    guidance: c.guidance ?? "",
  });

  async function decide(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    const body = action === "approve"
      ? { action, intent: d.intent, service_id: d.service_id, patient_message: d.patient_message.trim(), ideal_reply: d.ideal_reply.trim(), guidance: d.guidance.trim() || null }
      : { action };
    const res = await inboxFetch(`/api/inbox/ai/candidates/${c.id}`, { method: "PATCH", body });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(action === "approve" ? "Caso aprobado. Yendy ya lo usa como ejemplo." : "Candidato descartado");
    onDone();
  }

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {c.outcome === "attended" ? <Chip tone="primary">Asistió</Chip> : <Chip tone="primary">Agendó</Chip>}
        <Chip tone="muted">{INTENT_LABEL[d.intent] ?? d.intent}</Chip>
        {d.service_id && serviceName.get(d.service_id) && <Chip tone="muted">{serviceName.get(d.service_id)}</Chip>}
        <span className="ml-auto inline-flex items-center gap-0.5" title={`Reutilizable: ${c.score} de 5`} aria-label={`Reutilizable ${c.score} de 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("h-3 w-3", n <= c.score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          ))}
        </span>
        <Link href={`/conversaciones?c=${c.conversation_id}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          Ver chat <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="mb-2 text-sm font-semibold">{c.title}</p>

      {edit ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Situación</span>
              <select className={input} value={d.intent} onChange={(e) => setD({ ...d, intent: e.target.value })}>
                {Object.entries(INTENT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium">Servicio (opcional)</span>
              <select className={input} value={d.service_id ?? ""} onChange={(e) => setD({ ...d, service_id: e.target.value || null })}>
                <option value="">— Ninguno —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Lo que escribió la paciente</span>
            <textarea className={`${input} min-h-[60px]`} maxLength={1500} value={d.patient_message} onChange={(e) => setD({ ...d, patient_message: e.target.value })} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">La respuesta que funcionó</span>
            <textarea className={`${input} min-h-[80px]`} maxLength={2000} value={d.ideal_reply} onChange={(e) => setD({ ...d, ideal_reply: e.target.value })} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Hacia dónde encauzar después</span>
            <input className={input} maxLength={600} value={d.guidance} onChange={(e) => setD({ ...d, guidance: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="space-y-1.5 text-[13px]">
          <p className="rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-[11px] font-semibold text-muted-foreground">Paciente · </span>
            <span className="whitespace-pre-wrap">{d.patient_message}</span>
          </p>
          <p className="rounded-lg bg-primary/5 px-3 py-2">
            <span className="text-[11px] font-semibold text-primary">Clínica · </span>
            <span className="whitespace-pre-wrap">{d.ideal_reply}</span>
          </p>
          {d.guidance && (
            <p className="px-1 text-xs text-muted-foreground">
              <span className="font-semibold">Encauzar después:</span> {d.guidance}
            </p>
          )}
        </div>
      )}
      {c.rationale && (
        <p className="mt-2 flex items-start gap-1.5 text-xs italic text-muted-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c.rationale}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !d.patient_message.trim() || !d.ideal_reply.trim()}
          onClick={() => void decide("approve")}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" /> Aprobar como caso
        </button>
        <button type="button" onClick={() => setEdit(!edit)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
          {edit ? "Ver" : "Corregir antes"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide("reject")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
      </div>
    </li>
  );
}
