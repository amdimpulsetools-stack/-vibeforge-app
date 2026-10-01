"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Plus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { inboxKeys, useInboxSettings, useOrgTags, useQuickReplies, type InboxSettingsRow } from "./use-inbox";

/**
 * Ajustes de Conversaciones (solo owner/admin; la RLS de la 275 lo
 * vuelve a exigir): permisos, Yendy IA, etiquetas, respuestas rápidas,
 * base de conocimientos y brechas.
 */
export function InboxSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogTitle>Ajustes de Conversaciones</DialogTitle>
        <DialogDescription>Permisos, Yendy IA y todo lo que usa la recepción en la bandeja.</DialogDescription>
        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="kb">Base de conocimientos</TabsTrigger>
            <TabsTrigger value="gaps">Brechas</TabsTrigger>
            <TabsTrigger value="quick">Respuestas rápidas</TabsTrigger>
            <TabsTrigger value="tags">Etiquetas</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <GeneralTab />
          </TabsContent>
          <TabsContent value="kb">
            <KbTab />
          </TabsContent>
          <TabsContent value="gaps">
            <GapsTab />
          </TabsContent>
          <TabsContent value="quick">
            <QuickRepliesTab />
          </TabsContent>
          <TabsContent value="tags">
            <TagsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";

function GeneralTab() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data } = useInboxSettings(organizationId);
  const [s, setS] = useState<InboxSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  if (!s) return <p className="py-6 text-sm text-muted-foreground">Cargando…</p>;

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await createClient()
      .from("wa_inbox_settings")
      .upsert({ organization_id: organizationId, ...s, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Ajustes guardados");
    qc.invalidateQueries({ queryKey: inboxKeys.settings(organizationId) });
    qc.invalidateQueries({ queryKey: ["inbox-doctor-access"] });
  }

  return (
    <div className="space-y-4 py-3">
      <SettingRow
        title="Doctores pueden ver Conversaciones"
        hint="Por defecto solo administración y recepción ven la bandeja."
        control={<Switch checked={s.doctors_enabled} onCheckedChange={(v) => setS({ ...s, doctors_enabled: v })} />}
      />
      <SettingRow
        title="Yendy IA (sugerencias de respuesta)"
        hint="La IA sugiere borradores con la base de conocimientos; siempre envía una persona."
        control={<Switch checked={s.ai_enabled} onCheckedChange={(v) => setS({ ...s, ai_enabled: v })} />}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Modelo</span>
          <select className={input} value={s.ai_model} onChange={(e) => setS({ ...s, ai_model: e.target.value as InboxSettingsRow["ai_model"] })}>
            <option value="claude-haiku-4-5">Haiku 4.5 — rápido y económico</option>
            <option value="claude-sonnet-5-5">Sonnet 5.5 — más preciso</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Trato</span>
          <select className={input} value={s.ai_tone} onChange={(e) => setS({ ...s, ai_tone: e.target.value as InboxSettingsRow["ai_tone"] })}>
            <option value="calido">Cálido (tutea)</option>
            <option value="formal">Formal (de usted)</option>
          </select>
        </label>
      </div>
      <SettingRow
        title="Usar emojis"
        hint="Como máximo uno por mensaje."
        control={<Switch checked={s.ai_use_emojis} onCheckedChange={(v) => setS({ ...s, ai_use_emojis: v })} />}
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Firma (opcional)</span>
        <input className={input} maxLength={60} value={s.ai_signature ?? ""} placeholder="Ej. Equipo de Clínica Vitra" onChange={(e) => setS({ ...s, ai_signature: e.target.value || null })} />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
      </button>
    </div>
  );
}

function SettingRow({ title, hint, control }: { title: string; hint: string; control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {control}
    </div>
  );
}

// ── Base de conocimientos ─────────────────────────────────────────
interface KbEntry {
  id: string;
  kind: string;
  title: string;
  content: string;
  is_active: boolean;
}

const KIND_LABEL: Record<string, string> = {
  faq: "Pregunta frecuente",
  policy: "Política",
  service_info: "Ficha de servicio",
  preparation: "Preparación",
  general: "Información general",
};

function useKb(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.kb(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_entries")
        .select("id, kind, title, content, is_active")
        .eq("organization_id", orgId as string)
        .order("kind")
        .order("title");
      if (error) throw error;
      return (data ?? []) as KbEntry[];
    },
  });
}

function KbTab() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: entries = [], isPending } = useKb(organizationId);
  const [draft, setDraft] = useState<{ id?: string; kind: string; title: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft || !draft.title.trim() || !draft.content.trim()) return void toast.error("Título y contenido son obligatorios");
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const row = {
      organization_id: organizationId,
      kind: draft.kind,
      title: draft.title.trim(),
      content: draft.content.trim(),
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await supabase.from("wa_kb_entries").update(row).eq("id", draft.id)
      : await supabase.from("wa_kb_entries").insert(row);
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar la ficha");
    setDraft(null);
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
  }
  async function remove(id: string) {
    const { error } = await createClient().from("wa_kb_entries").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
  }

  return (
    <div className="space-y-3 py-3">
      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Cómo aprende Yendy IA</p>
        <p className="mt-1">
          Los <strong>servicios, precios (con su IGV), duración, indicaciones previas, doctores, sedes y horario</strong> los toma
          solos del sistema: mantenlos al día en Administración y la IA siempre citará el precio real.
        </p>
        <p className="mt-1">
          Aquí agrega lo que no está en el sistema, en fichas cortas (una idea por ficha): formas de pago, política de
          cancelación, cómo llegar, estacionamiento, qué incluye cada servicio, preparación para exámenes, preguntas que se
          repiten. Las fichas cortas y concretas funcionan mejor que textos largos.
        </p>
      </div>

      {draft ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <select className={input} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className={input} maxLength={120} placeholder="Título (ej. ¿Aceptan tarjeta?)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <textarea
            className={`${input} min-h-[110px]`}
            maxLength={4000}
            placeholder="Respuesta tal como quieres que la use la IA (ej. Aceptamos efectivo, Yape, Plin y tarjetas Visa/Mastercard. No aceptamos cheques.)"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar ficha
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setDraft({ kind: "faq", title: "", content: "" })} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          <Plus className="h-4 w-4" /> Nueva ficha
        </button>
      )}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay fichas.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {e.title} <span className="ml-1 text-[11px] font-normal text-muted-foreground">{KIND_LABEL[e.kind] ?? e.kind}</span>
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{e.content}</p>
              </div>
              <button type="button" onClick={() => setDraft({ id: e.id, kind: e.kind, title: e.title, content: e.content })} className="text-xs text-primary">
                Editar
              </button>
              <button type="button" onClick={() => void remove(e.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar ficha">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Brechas ───────────────────────────────────────────────────────
function GapsTab() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: gaps = [] } = useQuery({
    queryKey: inboxKeys.gaps(organizationId),
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_gaps")
        .select("id, question, created_at")
        .eq("organization_id", organizationId as string)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; question: string; created_at: string }>;
    },
  });
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  async function resolve(id: string, question: string, withAnswer: boolean) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let kbId: string | null = null;
    if (withAnswer) {
      if (!answer.trim()) return void toast.error("Escribe la respuesta");
      const { data, error } = await supabase
        .from("wa_kb_entries")
        .insert({ organization_id: organizationId, kind: "faq", title: question.slice(0, 120), content: answer.trim(), updated_by: user?.id ?? null })
        .select("id")
        .single();
      if (error || !data) return void toast.error("No se pudo crear la ficha");
      kbId = data.id as string;
    }
    const { error } = await supabase
      .from("wa_kb_gaps")
      .update({ status: withAnswer ? "answered" : "dismissed", kb_entry_id: kbId, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq("id", id);
    if (error) return void toast.error("No se pudo actualizar");
    setAnswering(null);
    setAnswer("");
    qc.invalidateQueries({ queryKey: inboxKeys.gaps(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
    if (withAnswer) toast.success("Agregado a la base de conocimientos");
  }

  return (
    <div className="space-y-3 py-3">
      <p className="text-xs text-muted-foreground">
        Preguntas reales de pacientes que Yendy IA no pudo responder con la base. Respóndelas una vez y la IA ya las sabrá.
      </p>
      {gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay brechas abiertas. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li key={g.id} className="rounded-lg border border-border p-3">
              <p className="text-sm">“{g.question}”</p>
              {answering === g.id ? (
                <div className="mt-2 space-y-2">
                  <textarea className={`${input} min-h-[80px]`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Respuesta para la base de conocimientos" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAnswering(null)} className="rounded-lg border border-border px-3 py-1 text-xs">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => void resolve(g.id, g.question, true)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      <Check className="h-3.5 w-3.5" /> Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" onClick={() => setAnswering(g.id)} className="font-medium text-primary">
                    Responder
                  </button>
                  <button type="button" onClick={() => void resolve(g.id, g.question, false)} className="text-muted-foreground">
                    Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Respuestas rápidas ────────────────────────────────────────────
function QuickRepliesTab() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuickReplies(organizationId);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function add() {
    const sc = shortcut.trim().toLowerCase().replace(/^\//, "");
    if (!/^[a-z0-9_-]{1,30}$/.test(sc)) return void toast.error("El atajo usa solo minúsculas, números, - o _ (ej. precios)");
    if (!title.trim() || !body.trim()) return void toast.error("Completa título y mensaje");
    const { error } = await createClient()
      .from("wa_quick_replies")
      .insert({ organization_id: organizationId, shortcut: sc, title: title.trim(), body: body.trim() });
    if (error) return void toast.error(error.code === "23505" ? "Ese atajo ya existe" : "No se pudo guardar");
    setShortcut("");
    setTitle("");
    setBody("");
    qc.invalidateQueries({ queryKey: inboxKeys.quickReplies(organizationId) });
  }
  async function remove(id: string) {
    const { error } = await createClient().from("wa_quick_replies").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.quickReplies(organizationId) });
  }

  return (
    <div className="space-y-3 py-3">
      <p className="text-xs text-muted-foreground">
        Escribe “/atajo” en el cuadro de texto para usarlas. Puedes poner {"{{nombre}}"} y {"{{clinica}}"}: se completan solos.
      </p>
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <input className={input} placeholder="/atajo" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
        <input className={input} placeholder="Título (ej. Formas de pago)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className={`${input} min-h-[80px]`} placeholder="Hola {{nombre}}, aceptamos…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" onClick={() => void add()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
        <Plus className="h-4 w-4" /> Agregar
      </button>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                /{r.shortcut} · {r.title}
              </p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{r.body}</p>
            </div>
            <button type="button" onClick={() => void remove(r.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Sin respuestas rápidas.</li>}
      </ul>
    </div>
  );
}

// ── Etiquetas ─────────────────────────────────────────────────────
function TagsTab() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: tags = [] } = useOrgTags(organizationId);
  async function remove(id: string) {
    const { error } = await createClient().from("org_tags").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.tags(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
  }
  return (
    <div className="space-y-3 py-3">
      <p className="text-xs text-muted-foreground">Las etiquetas se crean desde el panel derecho de cada chat. Aquí puedes borrarlas.</p>
      <ul className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <li key={t.id} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
            {t.name}
            <button type="button" onClick={() => void remove(t.id)} aria-label={`Borrar ${t.name}`}>
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        {tags.length === 0 && <li className="text-sm text-muted-foreground">Sin etiquetas.</li>}
      </ul>
    </div>
  );
}
