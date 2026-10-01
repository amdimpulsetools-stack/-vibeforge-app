"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, X, Plus, Loader2, UserPlus, Link2, CalendarDays, CalendarCheck, Megaphone, Sparkles, Archive, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { formatWaPhone, type InboxMessage } from "@/lib/inbox/shared";
import { inboxFetch, inboxKeys, useConversationOutcome, useInboxSettings, useOrgTags, useScheduled, type ConversationRow } from "./use-inbox";

type Section = "attributes" | "tags" | "notes" | "ai" | "scheduled";

const TAG_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#64748b"];

export function DetailsPanel({
  conversation,
  messages,
  timezone,
  onClose,
}: {
  conversation: ConversationRow;
  messages: InboxMessage[];
  timezone: string;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState<Section | null>("attributes");
  const toggle = (s: Section) => setOpen(open === s ? null : s);
  const qc = useQueryClient();
  const { organizationId } = useOrganization();

  const notes = messages.filter((m) => m.direction === "internal");
  const fmtDateTime = useMemo(() => {
    const f = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return (iso: string) => f.format(new Date(iso));
  }, [timezone]);

  async function setStatus(status: "open" | "closed") {
    const res = await inboxFetch(`/api/inbox/conversations/${conversation.id}`, { method: "PATCH", body: { inbox_status: status } });
    if (!res.ok) return void toast.error(res.error);
    toast.success(status === "closed" ? "Conversación archivada" : "Conversación reabierta");
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border/60 bg-card" aria-label="Detalles del contacto">
      {onClose && (
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 lg:hidden">
          <strong className="text-sm">Detalles</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar detalles" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Toggle label="Atributos" expanded={open === "attributes"} onClick={() => toggle("attributes")} />
        {open === "attributes" && (
          <>
            <Attributes conversation={conversation} />
            <Outcome conversation={conversation} timezone={timezone} />
          </>
        )}

        <Toggle label="Etiquetas" expanded={open === "tags"} onClick={() => toggle("tags")} count={conversation.wa_conversation_tags.length} />
        {open === "tags" && <Tags conversation={conversation} />}

        <Toggle label="Notas internas" expanded={open === "notes"} onClick={() => toggle("notes")} count={notes.length} />
        {open === "notes" && (
          <div className="space-y-2 border-b border-border/60 bg-muted/20 px-4 py-3">
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin notas. Usa el botón de nota (📝) en el cuadro de texto: el equipo la ve, la paciente no.</p>
            ) : (
              notes
                .slice()
                .reverse()
                .map((n) => (
                  <div key={n.id} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">{fmtDateTime(n.ts)}</p>
                  </div>
                ))
            )}
          </div>
        )}

        <Toggle label="Yendy IA" expanded={open === "ai"} onClick={() => toggle("ai")} />
        {open === "ai" && <AiInfo />}

        <Toggle label="Mensajes programados" expanded={open === "scheduled"} onClick={() => toggle("scheduled")} />
        {open === "scheduled" && <Scheduled conversation={conversation} fmt={fmtDateTime} />}

        <div className="space-y-2 px-4 py-4">
          {conversation.patient_id ? (
            <Link
              href={`/scheduler?patient_id=${conversation.patient_id}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <CalendarDays className="h-4 w-4" /> Agendar cita
            </Link>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
              Vincula o crea la ficha para agendar desde aquí.
            </p>
          )}
          {conversation.first_referral_headline && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Llegó por el anuncio: “{conversation.first_referral_headline}”
            </p>
          )}
          {conversation.inbox_status === "open" ? (
            <button type="button" onClick={() => void setStatus("closed")} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              <Archive className="h-3.5 w-3.5" /> Archivar conversación
            </button>
          ) : (
            <button type="button" onClick={() => void setStatus("open")} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Reabrir conversación
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Toggle({ label, expanded, onClick, count }: { label: string; expanded: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="flex min-h-[54px] w-full items-center justify-between border-b border-border/60 px-4 text-left hover:bg-muted/30"
    >
      <strong className="text-sm">
        {label}
        {count ? <span className="ml-1.5 text-xs font-medium text-muted-foreground">{count}</span> : null}
      </strong>
      <ChevronRight className={cn("h-4 w-4 transition-transform", expanded ? "-rotate-90" : "rotate-90")} />
    </button>
  );
}

// ── Atributos: ficha del paciente ─────────────────────────────────
interface PatientHit {
  id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  phone: string | null;
  email: string | null;
}

function Attributes({ conversation }: { conversation: ConversationRow }) {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "search" | "create">("view");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [suggested, setSuggested] = useState<PatientHit[]>([]);
  const [busy, setBusy] = useState(false);
  const p = conversation.patients;
  const last9 = (conversation.phone_normalized ?? "").replace(/\D/g, "").slice(-9);

  // Coincidencias por teléfono (últimos 9 dígitos): la sugerencia más útil.
  useEffect(() => {
    if (conversation.patient_id || last9.length < 9 || !organizationId) return;
    let cancelled = false;
    void createClient()
      .from("patients")
      .select("id, first_name, last_name, dni, phone, email")
      .eq("organization_id", organizationId)
      .ilike("phone", `%${last9.slice(0, 3)}%${last9.slice(3, 6)}%${last9.slice(6)}%`)
      .limit(3)
      .then(({ data }) => {
        if (!cancelled) setSuggested((data ?? []) as PatientHit[]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.patient_id, last9, organizationId]);

  useEffect(() => {
    if (mode !== "search" || q.trim().length < 2 || !organizationId) {
      setHits([]);
      return;
    }
    const term = q.trim().replace(/[%,()]/g, " ");
    const t = setTimeout(async () => {
      const { data } = await createClient()
        .from("patients")
        .select("id, first_name, last_name, dni, phone, email")
        .eq("organization_id", organizationId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,dni.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(8);
      setHits((data ?? []) as PatientHit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, organizationId]);

  async function link(patientId: string | null) {
    setBusy(true);
    const res = await inboxFetch(`/api/inbox/conversations/${conversation.id}`, { method: "PATCH", body: { patient_id: patientId } });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(patientId ? "Ficha vinculada" : "Ficha desvinculada");
    setMode("view");
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
  }

  if (mode === "create") {
    return <QuickPatientForm conversation={conversation} onCancel={() => setMode("view")} onCreated={(id) => void link(id)} />;
  }

  return (
    <div className="border-b border-border/60 pb-3">
      {p ? (
        <dl className="divide-y divide-border/40 text-xs">
          <Row k="Nombre" v={`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()} />
          <Row k="Documento" v={p.dni ?? "—"} />
          <Row k="Teléfono" v={p.phone ?? formatWaPhone(conversation.phone_normalized)} />
          <Row k="Correo" v={p.email ?? "—"} />
          <Row k="Medio" v="WhatsApp" />
        </dl>
      ) : (
        <dl className="divide-y divide-border/40 text-xs">
          <Row k="Nombre" v={conversation.display_name ?? "—"} />
          <Row k="WhatsApp" v={formatWaPhone(conversation.phone_normalized)} />
          <Row k="Ficha" v="Sin vincular" />
        </dl>
      )}

      <div className="space-y-2 px-4 pt-3">
        {p ? (
          <button type="button" onClick={() => void link(null)} disabled={busy} className="text-[11px] text-muted-foreground underline hover:text-foreground">
            Desvincular ficha
          </button>
        ) : (
          <>
            {suggested.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                <p className="mb-1 text-[10.5px] font-semibold text-primary">Coincide por teléfono</p>
                {suggested.map((h) => (
                  <PatientChoice key={h.id} h={h} onPick={() => void link(h.id)} disabled={busy} />
                ))}
              </div>
            )}
            {mode === "search" ? (
              <div className="space-y-1">
                <label className="flex items-center gap-2 rounded-lg border border-input px-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Nombre, DNI o teléfono"
                    className="w-full bg-transparent py-1.5 text-xs outline-none"
                  />
                </label>
                {hits.map((h) => (
                  <PatientChoice key={h.id} h={h} onPick={() => void link(h.id)} disabled={busy} />
                ))}
                <button type="button" onClick={() => setMode("view")} className="text-[11px] text-muted-foreground underline">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("search")}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-muted"
                >
                  <Link2 className="h-3.5 w-3.5" /> Vincular ficha
                </button>
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-muted"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Crear paciente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 truncate text-right">{v || "—"}</dd>
    </div>
  );
}

function PatientChoice({ h, onPick, disabled }: { h: PatientHit; onPick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onPick} disabled={disabled} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
      <strong>
        {h.first_name} {h.last_name}
      </strong>
      <span className="block text-[10.5px] text-muted-foreground">
        {[h.dni, h.phone].filter(Boolean).join(" · ") || "Sin documento"}
      </span>
    </button>
  );
}

function QuickPatientForm({
  conversation,
  onCancel,
  onCreated,
}: {
  conversation: ConversationRow;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const { organizationId } = useOrganization();
  const parts = (conversation.display_name ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(parts[0] ?? "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" "));
  const [docType, setDocType] = useState("DNI");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const phone = conversation.phone_normalized ? `+${conversation.phone_normalized}` : "";

  async function create() {
    if (!firstName.trim() || !lastName.trim()) return void toast.error("Nombre y apellido son obligatorios");
    if (docType === "DNI" && dni && !/^\d{8}$/.test(dni)) return void toast.error("El DNI tiene 8 dígitos");
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("patients")
      .insert({
        organization_id: organizationId,
        created_by: user?.id ?? null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        document_type: docType,
        dni: dni.trim() || null,
        phone: phone || null,
        email: email.trim() || null,
        status: "active",
        origin: "WhatsApp",
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.code === "23505" ? "Ese documento ya existe: usa “Vincular ficha”." : "No se pudo crear la ficha");
      return;
    }
    onCreated(data.id as string);
  }

  const input = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30";
  return (
    <div className="space-y-2 border-b border-border/60 px-4 py-3">
      <p className="text-xs font-semibold">Crear paciente</p>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Nombres *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <input className={input} placeholder="Apellidos *" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <select className={input} value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="DNI">DNI</option>
          <option value="CE">CE</option>
          <option value="PASAPORTE">Pasaporte</option>
        </select>
        <input className={input} placeholder="Documento (opcional)" value={dni} onChange={(e) => setDni(e.target.value)} />
      </div>
      <input className={input} placeholder="Correo (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="text-[10.5px] text-muted-foreground">Teléfono: {formatWaPhone(conversation.phone_normalized)} (de WhatsApp).</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear y vincular
        </button>
      </div>
    </div>
  );
}

// ── Resultado (mig 278): Agendó / Asistió, lo estampa la agenda ───
function Outcome({ conversation, timezone }: { conversation: ConversationRow; timezone: string }) {
  const q = useConversationOutcome(conversation.id, conversation.updated_at);
  if (q.error) {
    return (
      <p className="border-b border-border/60 px-4 py-2 text-[11px] text-red-600 dark:text-red-400">
        No se pudo cargar el resultado.{" "}
        <button type="button" className="underline" onClick={() => void q.refetch()}>
          Reintentar
        </button>
      </p>
    );
  }
  const o = q.data;
  if (!o?.outcome) {
    if (!conversation.patient_id) return null;
    return (
      <p className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <CalendarCheck className="h-3.5 w-3.5" /> Aún sin cita. Cuando se agende, aquí aparecerá “Agendó” solo.
      </p>
    );
  }
  const when = o.outcome_at
    ? new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "short" }).format(new Date(o.outcome_at))
    : null;
  const attended = o.outcome === "attended";
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 border-b border-border/60 px-4 py-2 text-[11px] font-medium",
        attended ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300",
      )}
    >
      <CalendarCheck className="h-3.5 w-3.5" /> {attended ? "Asistió a su cita" : "Agendó una cita"}
      {when && <span className="font-normal text-muted-foreground">· {when}</span>}
    </p>
  );
}

// ── Etiquetas ─────────────────────────────────────────────────────
function Tags({ conversation }: { conversation: ConversationRow }) {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: tags = [] } = useOrgTags(organizationId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const applied = new Set(conversation.wa_conversation_tags.map((t) => t.tag_id));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.tags(organizationId) });
  };

  async function apply(tagId: string) {
    const { error } = await createClient()
      .from("wa_conversation_tags")
      .insert({ organization_id: organizationId, conversation_id: conversation.id, tag_id: tagId });
    if (error && error.code !== "23505") return void toast.error("No se pudo etiquetar");
    refresh();
  }
  async function remove(tagId: string) {
    const { error } = await createClient().from("wa_conversation_tags").delete().eq("conversation_id", conversation.id).eq("tag_id", tagId);
    if (error) return void toast.error("No se pudo quitar la etiqueta");
    refresh();
  }
  async function createAndApply() {
    const n = name.trim();
    if (!n) return;
    const { data, error } = await createClient().from("org_tags").insert({ organization_id: organizationId, name: n, color }).select("id").single();
    if (error || !data) return void toast.error(error?.code === "23505" ? "Ya existe una etiqueta con ese nombre" : "No se pudo crear");
    setName("");
    setAdding(false);
    await apply(data.id as string);
  }

  return (
    <div className="space-y-2 border-b border-border/60 px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {tags
          .filter((t) => applied.has(t.id))
          .map((t) => (
            <span
              key={t.id}
              title={t.system_key ? "Etiqueta automática: la pone la agenda" : undefined}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.system_key && <Sparkles className="h-3 w-3" aria-label="automática" />}
              {t.name}
              <button type="button" onClick={() => void remove(t.id)} aria-label={`Quitar ${t.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        {applied.size === 0 && <span className="text-[11px] text-muted-foreground">Sin etiquetas.</span>}
      </div>
      {tags.some((t) => !applied.has(t.id)) && (
        <div className="flex flex-wrap gap-1">
          {tags
            .filter((t) => !applied.has(t.id))
            .map((t) => (
              <button key={t.id} type="button" onClick={() => void apply(t.id)} className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                + {t.name}
              </button>
            ))}
        </div>
      )}
      {adding ? (
        <div className="space-y-1.5">
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void createAndApply()}
            placeholder="Nueva etiqueta (ej. Nuevo lead)"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
          />
          <div className="flex items-center gap-1">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn("h-5 w-5 rounded-full", color === c && "ring-2 ring-foreground/40 ring-offset-1")}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            <button type="button" onClick={() => void createAndApply()} className="ml-auto rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
              Crear
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          <Plus className="h-3.5 w-3.5" /> Nueva etiqueta
        </button>
      )}
    </div>
  );
}

// ── Yendy IA ──────────────────────────────────────────────────────
function AiInfo() {
  const { organizationId } = useOrganization();
  const { data: settings } = useInboxSettings(organizationId);
  return (
    <div className="space-y-1.5 border-b border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        {settings?.ai_enabled === false ? "Desactivada" : `Lista · ${settings?.ai_model === "claude-sonnet-5-5" ? "Sonnet 5.5" : "Haiku 4.5"}`}
      </p>
      <p>
        Pulsa el botón de colores en el cuadro de texto → <strong>Sugerencias</strong>. La IA responde con la base de conocimientos de la
        clínica (servicios, precios, horarios y las fichas que escriba el equipo). Nunca envía sola.
      </p>
      <p>Lo que no sabe queda en “Brechas” (Ajustes ⚙) para completarlo.</p>
    </div>
  );
}

// ── Programados ───────────────────────────────────────────────────
function Scheduled({ conversation, fmt }: { conversation: ConversationRow; fmt: (iso: string) => string }) {
  const { data: rows = [], refetch } = useScheduled(conversation.id);
  async function cancel(id: string) {
    const res = await inboxFetch(`/api/inbox/scheduled?id=${id}`, { method: "DELETE" });
    if (!res.ok) return void toast.error(res.error);
    toast.success("Programado cancelado");
    void refetch();
  }
  const label: Record<string, string> = {
    pending: "Pendiente",
    sending: "Enviando…",
    needs_template: "Requiere plantilla",
    failed: "No se envió",
  };
  return (
    <div className="space-y-2 border-b border-border/60 bg-muted/20 px-4 py-3">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay mensajes programados. Usa el reloj del cuadro de texto.</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <strong>{fmt(r.send_at)}</strong>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  r.status === "pending" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {label[r.status] ?? r.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-muted-foreground">{r.kind === "template" ? "Plantilla" : r.body}</p>
            {r.last_error && <p className="mt-1 text-[10.5px] text-amber-700 dark:text-amber-400">{r.last_error}</p>}
            {r.status !== "sending" && (
              <button type="button" onClick={() => void cancel(r.id)} className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground">
                Cancelar
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
