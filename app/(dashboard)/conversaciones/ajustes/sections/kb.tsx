"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { inboxKeys, useInboxSettings, useOrgServices } from "../../use-inbox";
import { Chip, GhostButton, Hint, input, Loading, LoadFailed, SaveButton, SectionHeader } from "./shared";

/**
 * Base de conocimientos en dos vistas:
 *  - Por servicio: fichas colgadas de cada servicio del catálogo (qué
 *    incluye, para quién, beneficio esperado, preparación, después,
 *    preguntas frecuentes, objeción). Yendy las lee debajo del servicio.
 *  - Generales: lo que no es de un servicio (políticas, formas de pago,
 *    cómo llegar, preguntas frecuentes de la clínica).
 * Precios, duración, IGV, doctores, sedes y horario NO se escriben aquí:
 * salen solos del sistema.
 */

export interface KbEntry {
  id: string;
  kind: string;
  title: string;
  content: string;
  service_id: string | null;
  is_active: boolean;
}

const SERVICE_KINDS: Array<{ key: string; label: string; title: string; placeholder: string }> = [
  { key: "includes", label: "Qué incluye", title: "Qué incluye", placeholder: "Ej. Evaluación con la especialista, ecografía y plan por escrito. No incluye exámenes de laboratorio." },
  { key: "for_whom", label: "Para quién es", title: "Para quién es", placeholder: "Ej. Mujeres que llevan más de 12 meses buscando embarazo (6 si tienen más de 35)." },
  { key: "benefits", label: "Beneficio esperado", title: "Qué puede esperar", placeholder: "Ej. Salir con un diagnóstico claro y los siguientes pasos. (Sin prometer resultados.)" },
  { key: "preparation", label: "Preparación", title: "Cómo prepararse", placeholder: "Ej. Venir con exámenes previos si los tiene; no requiere ayuno." },
  { key: "aftercare", label: "Después", title: "Después del procedimiento", placeholder: "Ej. Reposo relativo 24 h; puede haber molestia leve; control a los 7 días." },
  { key: "faq", label: "Pregunta frecuente", title: "", placeholder: "La respuesta tal como quieres que la use Yendy." },
  { key: "objection", label: "Si la paciente objeta", title: "", placeholder: "Ej. “Está caro” → explicar qué incluye y ofrecer empezar por la evaluación." },
];
const GENERAL_KINDS: Array<{ key: string; label: string }> = [
  { key: "faq", label: "Pregunta frecuente" },
  { key: "policy", label: "Política" },
  { key: "general", label: "Información general" },
  { key: "preparation", label: "Preparación" },
  { key: "service_info", label: "Ficha de servicio (antigua)" },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries([...SERVICE_KINDS.map((k) => [k.key, k.label]), ...GENERAL_KINDS.map((k) => [k.key, k.label])]);

export function useKbEntries(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.kb(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_entries")
        .select("id, kind, title, content, service_id, is_active")
        .eq("organization_id", orgId as string)
        .order("kind")
        .order("title");
      if (error) throw new PostgrestLoadError("Base de conocimientos", error);
      return (data ?? []) as KbEntry[];
    },
  });
}

type Draft = { id?: string; kind: string; title: string; content: string; service_id: string | null };

export default function KbSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const entries = useKbEntries(organizationId);
  const services = useOrgServices(organizationId);
  const settings = useInboxSettings(organizationId);
  const [view, setView] = useState<"services" | "general">("services");
  const [query, setQuery] = useState("");
  const [openService, setOpenService] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const hidden = useMemo(() => new Set(settings.data?.ai_hidden_service_ids ?? []), [settings.data]);
  const activeServiceIds = useMemo(() => new Set((services.data ?? []).map((s) => s.id)), [services.data]);
  const all = entries.data ?? [];
  const q = query.trim().toLowerCase();
  const matches = (e: KbEntry) => !q || e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);

  const byService = useMemo(() => {
    const m = new Map<string, KbEntry[]>();
    for (const e of all) {
      if (e.service_id && activeServiceIds.has(e.service_id)) m.set(e.service_id, [...(m.get(e.service_id) ?? []), e]);
    }
    return m;
  }, [all, activeServiceIds]);
  const generals = all.filter((e) => !(e.service_id && activeServiceIds.has(e.service_id)));

  async function save() {
    if (!draft) return;
    const kindMeta = SERVICE_KINDS.find((k) => k.key === draft.kind);
    const title = (draft.title.trim() || kindMeta?.title || "").trim();
    if (!title || !draft.content.trim()) return void toast.error("Título y contenido son obligatorios");
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const row = {
      organization_id: organizationId,
      kind: draft.kind,
      title: title.slice(0, 120),
      content: draft.content.trim(),
      service_id: draft.service_id,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id ? await supabase.from("wa_kb_entries").update(row).eq("id", draft.id) : await supabase.from("wa_kb_entries").insert(row);
    setSaving(false);
    if (error) return void toast.error(error.code === "23514" ? "Ese tipo de ficha requiere la migración 276" : "No se pudo guardar la ficha");
    setDraft(null);
    toast.success("Ficha guardada");
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
  }
  async function remove(id: string) {
    const { error } = await createClient().from("wa_kb_entries").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
  }
  async function toggleActive(e: KbEntry) {
    const { error } = await createClient().from("wa_kb_entries").update({ is_active: !e.is_active }).eq("id", e.id);
    if (error) return void toast.error("No se pudo actualizar");
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
  }

  if (entries.error) return <LoadFailed error={entries.error} onRetry={() => void entries.refetch()} />;
  if (services.error) return <LoadFailed error={services.error} onRetry={() => void services.refetch()} />;
  if (entries.isPending || services.isPending) return <Loading />;

  const serviceCardCount = [...byService.values()].reduce((n, arr) => n + arr.length, 0);
  const servicesWithout = (services.data ?? []).filter((s) => !byService.has(s.id) && !hidden.has(s.id)).length;

  const form = draft && (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <select className={input} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          {(draft.service_id ? SERVICE_KINDS : GENERAL_KINDS).map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          className={input}
          maxLength={120}
          placeholder={SERVICE_KINDS.find((k) => k.key === draft.kind)?.title || "Título (ej. ¿Aceptan tarjeta?)"}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <textarea
        className={`${input} min-h-[110px]`}
        maxLength={4000}
        placeholder={SERVICE_KINDS.find((k) => k.key === draft.kind)?.placeholder ?? "Respuesta tal como quieres que la use Yendy (corta y concreta)."}
        value={draft.content}
        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
      />
      <div className="flex gap-2">
        <GhostButton onClick={() => setDraft(null)}>Cancelar</GhostButton>
        <SaveButton saving={saving} onClick={() => void save()} className="ml-auto px-3 py-1.5">
          Guardar ficha
        </SaveButton>
      </div>
    </div>
  );

  const entryRow = (e: KbEntry) => (
    <li key={e.id} className={cn("flex items-start gap-3 px-3 py-2.5", !e.is_active && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {e.title} <span className="ml-1 text-[11px] font-normal text-muted-foreground">{KIND_LABEL[e.kind] ?? e.kind}</span>
          {!e.is_active && <Chip tone="muted">pausada</Chip>}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{e.content}</p>
      </div>
      <button type="button" onClick={() => setDraft({ id: e.id, kind: e.kind, title: e.title, content: e.content, service_id: e.service_id })} className="text-xs text-primary">
        Editar
      </button>
      <button type="button" onClick={() => void toggleActive(e)} className="text-xs text-muted-foreground" title={e.is_active ? "Pausar (Yendy deja de usarla)" : "Activar"}>
        {e.is_active ? "Pausar" : "Activar"}
      </button>
      <button type="button" onClick={() => void remove(e.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar ficha">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Base de conocimientos"
        description="Lo que Yendy sabe de tu clínica. Precios, duración, IGV, doctores, sedes y horario salen solos del sistema; aquí va lo demás, en fichas cortas (una idea por ficha)."
      />
      <Hint>
        <p className="font-medium text-foreground">Cómo sacarle el máximo</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            <strong>Por servicio</strong>: para cada tratamiento, llena “Qué incluye”, “Para quién es”, “Preparación”, “Después” y una o dos objeciones. Cuando una paciente pregunte por ese servicio, Yendy responde con tu detalle y encauza hacia la evaluación.
          </li>
          <li>
            <strong>Generales</strong>: formas de pago, política de cancelación, cómo llegar, estacionamiento, preguntas que se repiten.
          </li>
          <li>
            Escribe la <strong>respuesta</strong>, no el reglamento. 2 a 6 líneas, en el tono en que lo diría recepción. Lo clínico (diagnósticos, dosis) no va aquí.
          </li>
        </ul>
      </Hint>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {(
            [
              ["services", `Por servicio · ${serviceCardCount}`],
              ["general", `Generales · ${generals.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={cn("rounded-md px-3 py-1.5 font-medium", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-9 min-w-[220px] items-center gap-2 rounded-lg border border-border px-2.5 text-muted-foreground">
          <Search className="h-4 w-4" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en las fichas" className="w-full bg-transparent text-sm text-foreground outline-none" />
        </label>
      </div>

      {view === "services" ? (
        <div className="space-y-2">
          {servicesWithout > 0 && (
            <p className="text-xs text-muted-foreground">
              {servicesWithout} servicio(s) todavía sin fichas: Yendy solo conoce su nombre, precio y duración.
            </p>
          )}
          {(services.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No hay servicios activos en el catálogo (Administración → Servicios).</p>}
          {(services.data ?? []).map((sv) => {
            const cards = (byService.get(sv.id) ?? []).filter(matches);
            const open = openService === sv.id || (!!q && cards.length > 0);
            if (q && cards.length === 0) return null;
            return (
              <div key={sv.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setOpenService(open && !q ? null : sv.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                >
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{sv.name}</span>
                  {hidden.has(sv.id) && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Marcado en Reglas: Yendy no lo ofrece por chat">
                      <EyeOff className="h-3 w-3" /> oculto para Yendy
                    </span>
                  )}
                  <Chip tone={cards.length ? "primary" : "muted"}>{(byService.get(sv.id) ?? []).length} fichas</Chip>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICE_KINDS.map((k) => {
                        const has = (byService.get(sv.id) ?? []).some((e) => e.kind === k.key);
                        return (
                          <button
                            key={k.key}
                            type="button"
                            onClick={() => setDraft({ kind: k.key, title: k.title, content: "", service_id: sv.id })}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                              has ? "border-primary/40 bg-primary/10 text-primary" : "border-dashed border-border text-muted-foreground hover:text-foreground",
                            )}
                            title={has ? "Agregar otra" : "Agregar"}
                          >
                            <Plus className="h-3 w-3" /> {k.label}
                          </button>
                        );
                      })}
                    </div>
                    {draft && draft.service_id === sv.id && form}
                    {cards.length > 0 ? (
                      <ul className="divide-y divide-border rounded-lg border border-border">{cards.map(entryRow)}</ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin fichas para este servicio. Empieza por “Qué incluye” y “Para quién es”.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {draft && !draft.service_id ? (
            form
          ) : (
            <button type="button" onClick={() => setDraft({ kind: "faq", title: "", content: "", service_id: null })} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              <Plus className="h-4 w-4" /> Nueva ficha general
            </button>
          )}
          {generals.filter(matches).length === 0 ? (
            <p className="text-sm text-muted-foreground">{q ? "Sin resultados." : "Todavía no hay fichas generales."}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">{generals.filter(matches).map(entryRow)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
