"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareQuote, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { inboxKeys, useOrgServices } from "../../use-inbox";
import { Chip, GhostButton, Hint, INTENT_LABEL, input, Loading, LoadFailed, SaveButton, SectionHeader } from "./shared";

/**
 * Casos reales: "la paciente escribió X → la clínica respondió Y → luego
 * Z". Son los ejemplos con los que Yendy aprende el tono y hacia dónde
 * encauzar. Se cargan aquí o desde el chat ("Guardar como caso").
 */

export interface KbCase {
  id: string;
  service_id: string | null;
  intent: string;
  title: string;
  patient_message: string;
  ideal_reply: string;
  guidance: string | null;
  source_conversation_id: string | null;
  is_active: boolean;
  updated_at: string;
}

export function useKbCases(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.cases(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_cases")
        .select("id, service_id, intent, title, patient_message, ideal_reply, guidance, source_conversation_id, is_active, updated_at")
        .eq("organization_id", orgId as string)
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw new PostgrestLoadError("Casos", error);
      return (data ?? []) as KbCase[];
    },
  });
}

type Draft = { id?: string; intent: string; service_id: string | null; patient_message: string; ideal_reply: string; guidance: string };
const EMPTY: Draft = { intent: "otro", service_id: null, patient_message: "", ideal_reply: "", guidance: "" };

export default function CasesSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const cases = useKbCases(organizationId);
  const services = useOrgServices(organizationId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState("");
  const [service, setService] = useState("");

  const serviceName = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s.name])), [services.data]);
  const list = (cases.data ?? []).filter((c) => {
    if (intent && c.intent !== intent) return false;
    if (service && c.service_id !== service) return false;
    const q = query.trim().toLowerCase();
    return !q || c.patient_message.toLowerCase().includes(q) || c.ideal_reply.toLowerCase().includes(q) || (c.guidance ?? "").toLowerCase().includes(q);
  });

  async function save() {
    if (!draft) return;
    if (!draft.patient_message.trim() || !draft.ideal_reply.trim()) return void toast.error("Escribe el mensaje de la paciente y la respuesta ideal");
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const row = {
      organization_id: organizationId,
      intent: draft.intent,
      service_id: draft.service_id,
      title: draft.patient_message.trim().slice(0, 120),
      patient_message: draft.patient_message.trim(),
      ideal_reply: draft.ideal_reply.trim(),
      guidance: draft.guidance.trim() || null,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await supabase.from("wa_kb_cases").update(row).eq("id", draft.id)
      : await supabase.from("wa_kb_cases").insert({ ...row, created_by: user?.id ?? null });
    setSaving(false);
    if (error) return void toast.error(error.code === "42P01" ? "Falta aplicar la migración 276" : "No se pudo guardar el caso");
    setDraft(null);
    toast.success("Caso guardado. Yendy ya lo usa como ejemplo.");
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
  }
  async function remove(id: string) {
    const { error } = await createClient().from("wa_kb_cases").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
  }
  async function toggleActive(c: KbCase) {
    const { error } = await createClient().from("wa_kb_cases").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return void toast.error("No se pudo actualizar");
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
  }

  if (cases.error) return <LoadFailed error={cases.error} onRetry={() => void cases.refetch()} />;
  if (cases.isPending) return <Loading />;

  const form = draft && (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block font-medium">Situación</span>
          <select className={input} value={draft.intent} onChange={(e) => setDraft({ ...draft, intent: e.target.value })}>
            {Object.entries(INTENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Servicio (opcional)</span>
          <select className={input} value={draft.service_id ?? ""} onChange={(e) => setDraft({ ...draft, service_id: e.target.value || null })}>
            <option value="">— Ninguno —</option>
            {(services.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Lo que escribió la paciente</span>
        <textarea className={`${input} min-h-[70px]`} maxLength={1500} value={draft.patient_message} onChange={(e) => setDraft({ ...draft, patient_message: e.target.value })} placeholder="Ej. Hola, quería saber el precio del tratamiento, es que me dijeron que es carísimo" />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">La mejor respuesta (como la daría tu equipo)</span>
        <textarea className={`${input} min-h-[90px]`} maxLength={2000} value={draft.ideal_reply} onChange={(e) => setDraft({ ...draft, ideal_reply: e.target.value })} placeholder="Ej. ¡Hola, María! Te entiendo. La consulta de evaluación cuesta S/ 150.00 e incluye… Si te parece, empezamos por ahí: ¿te acomoda esta semana o la próxima?" />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Hacia dónde encauzar después (opcional)</span>
        <input className={input} maxLength={600} value={draft.guidance} onChange={(e) => setDraft({ ...draft, guidance: e.target.value })} placeholder="Ej. Ofrecer dos horarios; si duda, mandar la ficha del servicio y escribirle en 3 días" />
      </label>
      <div className="flex gap-2">
        <GhostButton onClick={() => setDraft(null)}>Cancelar</GhostButton>
        <SaveButton saving={saving} onClick={() => void save()} className="ml-auto px-3 py-1.5">
          Guardar caso
        </SaveButton>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Casos reales"
        description="Mensajes reales de pacientes con la respuesta que tu equipo daría y hacia dónde encauzarlos. Son los ejemplos con los que Yendy aprende tu tono. Mientras más casos reales, más se parece a ti."
        action={
          !draft && (
            <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Nuevo caso
            </button>
          )
        }
      />
      <Hint>
        El camino más corto: en cualquier chat, pasa el mouse por un mensaje de la paciente y pulsa <strong className="text-foreground">“Guardar como caso”</strong>. Se precarga su mensaje y tu respuesta real. Quita datos personales antes de guardar.
      </Hint>
      {form}
      <div className="flex flex-wrap gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border px-2.5 text-muted-foreground">
          <Search className="h-4 w-4" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en los casos" className="w-full bg-transparent text-sm text-foreground outline-none" />
        </label>
        <select className={`${input} w-auto`} value={intent} onChange={(e) => setIntent(e.target.value)}>
          <option value="">Todas las situaciones</option>
          {Object.entries(INTENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={`${input} w-auto`} value={service} onChange={(e) => setService(e.target.value)}>
          <option value="">Todos los servicios</option>
          {(services.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{(cases.data ?? []).length === 0 ? "Todavía no hay casos. Empieza con los 10 mensajes que más se repiten." : "Sin resultados con esos filtros."}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className={cn("rounded-lg border border-border p-3", !c.is_active && "opacity-50")}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <Chip tone="primary">{INTENT_LABEL[c.intent] ?? c.intent}</Chip>
                {c.service_id && serviceName.get(c.service_id) && <Chip tone="muted">{serviceName.get(c.service_id)}</Chip>}
                {c.source_conversation_id && (
                  <Chip tone="muted">
                    <MessageSquareQuote className="mr-0.5 inline h-3 w-3" /> desde un chat
                  </Chip>
                )}
                {!c.is_active && <Chip tone="muted">pausado</Chip>}
                <span className="ml-auto flex gap-3 text-xs">
                  <button type="button" onClick={() => setDraft({ id: c.id, intent: c.intent, service_id: c.service_id, patient_message: c.patient_message, ideal_reply: c.ideal_reply, guidance: c.guidance ?? "" })} className="text-primary">
                    Editar
                  </button>
                  <button type="button" onClick={() => void toggleActive(c)} className="text-muted-foreground">
                    {c.is_active ? "Pausar" : "Activar"}
                  </button>
                  <button type="button" onClick={() => void remove(c.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar caso">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">Paciente:</span> “{c.patient_message}”
              </p>
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Clínica:</span> {c.ideal_reply}
              </p>
              {c.guidance && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Luego:</span> {c.guidance}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
