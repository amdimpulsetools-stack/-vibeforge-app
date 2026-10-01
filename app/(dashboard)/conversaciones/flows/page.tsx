"use client";

/**
 * Flows (mig 281): lista de automatizaciones de Conversaciones. Admin
 * crea, publica, pausa y archiva; recepción ve la lista y abre el editor
 * en solo lectura. Editor: /conversaciones/flows/[id].
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Workflow, Play, Pause, Archive, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { TRIGGER_LABEL, type TriggerKind } from "@/lib/inbox/flows/schema";
import { inboxFetch, setInboxOrg } from "../use-inbox";
import { flowKeys, useFlows, type FlowListItem } from "./use-flows";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
  active: { label: "Activo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  paused: { label: "Pausado", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  archived: { label: "Archivado", cls: "bg-muted text-muted-foreground" },
};

export default function FlowsPage() {
  const { organizationId } = useOrganization();
  setInboxOrg(organizationId ?? null);
  const { isAdmin, loading: roleLoading } = useOrgRole();
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useFlows(organizationId);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);

  if (roleLoading || addonsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!hasAnyAddon(["captacion"])) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <Workflow className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Flows no está disponible</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activa el módulo CRM WhatsApp + Captación.</p>
      </div>
    );
  }

  async function create(template?: "welcome" | "no_reply" | "confirm") {
    setMenu(false);
    setCreating(true);
    const res = await inboxFetch<{ flow: { id: string } }>("/api/inbox/flows", { method: "POST", body: template ? { template } : {} });
    setCreating(false);
    if (!res.ok) return void toast.error(res.error);
    qc.invalidateQueries({ queryKey: flowKeys.list(organizationId) });
    router.push(`/conversaciones/flows/${res.data.flow.id}`);
  }
  async function setStatus(f: FlowListItem, status: "active" | "paused" | "archived") {
    const res = await inboxFetch(`/api/inbox/flows/${f.id}`, { method: "PATCH", body: { status } });
    if (!res.ok) return void toast.error(res.error);
    toast.success(status === "active" ? "Flow activado" : status === "paused" ? "Flow pausado" : "Flow archivado");
    qc.invalidateQueries({ queryKey: flowKeys.list(organizationId) });
  }

  const flows = q.data?.flows ?? [];
  const templates = q.data?.templates ?? [];

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
        <div>
          <Link href="/conversaciones" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Conversaciones
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight">Flows</h1>
          <p className="text-sm text-muted-foreground">Lo que Yenda hace sola cuando una paciente escribe: bienvenida con menú, respuestas por palabra clave, aviso si nadie responde.</p>
        </div>
        {isAdmin && (
          <div className="relative">
            <button
              type="button"
              disabled={creating}
              onClick={() => setMenu(!menu)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nuevo flow
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-80 rounded-xl border border-border bg-card p-1.5 shadow-xl">
                {templates.map((t) => (
                  <button key={t.key} type="button" onClick={() => void create(t.key)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.description}</span>
                  </button>
                ))}
                <button type="button" onClick={() => void create()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                  En blanco
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto max-w-4xl">
          {q.error ? (
            <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {(q.error as Error).message}
            </div>
          ) : q.isPending ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </p>
          ) : flows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-2 text-lg font-bold">Aún no hay flows</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Empieza por una plantilla: “Bienvenida con menú” saluda y pregunta qué necesita la paciente; “Nadie respondió en 30 min” avisa a recepción. Todo flow termina siempre en una persona.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {flows.map((f) => {
                const st = STATUS[f.status] ?? STATUS.draft;
                const kind = (f.trigger?.kind as TriggerKind | undefined) ?? "manual";
                return (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <Link href={`/conversaciones/flows/${f.id}`} className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{f.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
                        {f.version > 0 && <span className="text-[10px] text-muted-foreground">v{f.version}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {TRIGGER_LABEL[kind] ?? kind}
                        {kind === "keyword" && f.trigger?.keywords?.length ? `: ${f.trigger.keywords.slice(0, 4).join(", ")}` : ""}
                        {" · "}
                        {f.runs} ejecuciones{f.active_runs > 0 ? ` · ${f.active_runs} en curso` : ""}
                      </span>
                    </Link>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        {f.status === "active" ? (
                          <button type="button" onClick={() => void setStatus(f, "paused")} title="Pausar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pause className="h-4 w-4" />
                          </button>
                        ) : f.version > 0 ? (
                          <button type="button" onClick={() => void setStatus(f, "active")} title="Activar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Play className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button type="button" onClick={() => void setStatus(f, "archived")} title="Archivar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <Link href={`/conversaciones/flows/${f.id}`} className="text-muted-foreground" aria-label={`Abrir ${f.name}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
