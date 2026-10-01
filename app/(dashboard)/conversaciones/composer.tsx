"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  FileText,
  Loader2,
  Send,
  Sparkles,
  StickyNote,
  X,
  Zap,
  AlertTriangle,
  PencilLine,
  RefreshCw,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { orgLocalToIso } from "@/lib/inbox/shared";
import { todayInTz } from "@/lib/org-time";
import {
  inboxFetch,
  inboxKeys,
  useApprovedTemplates,
  useInboxSettings,
  useQuickReplies,
  type ApprovedTemplate,
  type ConversationRow,
} from "./use-inbox";

type Tool = "ai" | "quick" | "template" | "schedule" | null;

interface AiDraft {
  suggestion_id: string | null;
  reply: string;
  alarm: boolean;
  needs_human: boolean;
  gap_question: string | null;
  price_issues: string[];
  sources: string[];
}

export function Composer({
  conversation,
  windowOpen,
  expectedLastMessageId,
  timezone,
  onSent,
}: {
  conversation: ConversationRow;
  windowOpen: boolean;
  expectedLastMessageId: string | null;
  timezone: string;
  onSent: () => void;
}) {
  const { organizationId, organization } = useOrganization();
  const qc = useQueryClient();
  const { data: quickReplies = [] } = useQuickReplies(organizationId);
  const { data: templates = [] } = useApprovedTemplates(organizationId);
  const { data: settings } = useInboxSettings(organizationId);

  const [text, setText] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [aiSuggestionInUse, setAiSuggestionInUse] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Borrador por conversación solo en memoria de la sesión (sessionStorage):
  // contiene datos de pacientes y las PCs de recepción son compartidas.
  const draftKey = `inbox-draft:${conversation.id}`;
  useEffect(() => {
    try {
      setText(sessionStorage.getItem(draftKey) ?? "");
    } catch {
      setText("");
    }
    setNoteMode(false);
    setTool(null);
    setAiDraft(null);
    setAiSuggestionInUse(null);
  }, [draftKey]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* sin storage: no pasa nada */
    }
  }, [draftKey, text]);

  // Auto-alto del textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // "/atajo" → sugerencias de respuestas rápidas.
  const slash = /^\/([a-z0-9_-]*)$/i.exec(text.trim());
  const slashMatches = useMemo(
    () => (slash ? quickReplies.filter((q) => q.shortcut.startsWith(slash[1].toLowerCase())).slice(0, 6) : []),
    [slash, quickReplies],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: inboxKeys.messages(conversation.id) });
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
    onSent();
  };

  async function send(force = false) {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const clientMsgId = crypto.randomUUID();
    if (noteMode) {
      const res = await inboxFetch("/api/inbox/notes", {
        method: "POST",
        body: { conversation_id: conversation.id, client_msg_id: clientMsgId, body },
      });
      setSending(false);
      if (!res.ok) return toast.error(res.error);
      setText("");
      refresh();
      return;
    }
    const res = await inboxFetch("/api/inbox/send", {
      method: "POST",
      body: {
        conversation_id: conversation.id,
        client_msg_id: clientMsgId,
        kind: "text",
        body,
        expected_last_message_id: expectedLastMessageId,
        force,
        ai_suggestion_id: aiSuggestionInUse,
      },
    });
    setSending(false);
    if (!res.ok) {
      if (res.code === "stale_thread") {
        refresh();
        toast.warning("Llegó un mensaje nuevo mientras escribías", {
          description: "Revísalo antes de enviar.",
          action: { label: "Enviar igual", onClick: () => void send(true) },
          duration: 10_000,
        });
        return;
      }
      if (res.code === "window_closed") setTool("template");
      toast.error(res.error);
      refresh();
      return;
    }
    setText("");
    setAiSuggestionInUse(null);
    refresh();
  }

  async function generate(instruction?: string) {
    if (aiLoading) return;
    setAiLoading(true);
    setTool(null);
    const res = await inboxFetch<AiDraft>("/api/inbox/ai/suggest", {
      method: "POST",
      body: { conversation_id: conversation.id, instruction: instruction ?? null },
    });
    setAiLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAiDraft(res.data);
  }

  const patientFirstName =
    conversation.patients?.first_name?.trim() || (conversation.display_name ?? "").trim().split(/\s+/)[0] || "";

  return (
    <footer className="relative shrink-0 border-t border-border/60 bg-card px-3 pb-3 pt-2.5 md:px-4">
      {!windowOpen && !noteMode && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Pasaron más de 24 h desde el último mensaje de la paciente. WhatsApp solo permite escribirle con una{" "}
            <button type="button" className="font-semibold underline" onClick={() => setTool("template")}>
              plantilla aprobada
            </button>{" "}
            (tiene costo). También puedes dejar una nota interna.
          </span>
        </div>
      )}

      {/* ── Vista previa de Yendy IA ── */}
      {(aiDraft || aiLoading) && (
        <div className="mb-2 rounded-xl border border-violet-300/50 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/10">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3.5 w-3.5" /> Yendy IA · sugerencia (tú decides si la envías)
            </p>
            <button type="button" onClick={() => setAiDraft(null)} className="text-muted-foreground hover:text-foreground" aria-label="Descartar sugerencia">
              <X className="h-4 w-4" />
            </button>
          </div>
          {aiLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando en la base de conocimientos…
            </p>
          ) : aiDraft ? (
            <>
              {aiDraft.alarm && (
                <p className="mb-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
                  Posible señal de alarma: revisa el mensaje y avisa al equipo médico. La IA no da indicaciones clínicas.
                </p>
              )}
              {!aiDraft.alarm && aiDraft.needs_human && (
                <p className="mb-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                  Revisa con cuidado: la consulta es delicada o falta información.
                </p>
              )}
              {aiDraft.price_issues.length > 0 && (
                <p className="mb-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-400">
                  El precio {aiDraft.price_issues.join(", ")} no coincide con el catálogo. Corrígelo antes de enviar.
                </p>
              )}
              {aiDraft.gap_question && (
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  Faltaba en la base: “{aiDraft.gap_question}”. Quedó en Brechas para que la clínica la complete.
                </p>
              )}
              <p className="whitespace-pre-wrap rounded-lg bg-card px-3 py-2 text-[13px]">{aiDraft.reply}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setText(aiDraft.reply);
                    setAiSuggestionInUse(aiDraft.suggestion_id);
                    setAiDraft(null);
                    setNoteMode(false);
                    textareaRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <PencilLine className="h-3.5 w-3.5" /> Usar y editar
                </button>
                <button
                  type="button"
                  onClick={() => void generate("más corto y directo")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Más corto
                </button>
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Otra versión
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Menús flotantes ── */}
      {tool === "ai" && (
        <div className="absolute bottom-[calc(100%-4px)] left-4 z-20 w-64 rounded-2xl border border-zinc-700 bg-zinc-900 p-1.5 text-white shadow-2xl">
          <MenuItem icon={<PencilLine className="h-4 w-4" />} title="Mi respuesta" hint="Sin asistencia de la IA." onClick={() => setTool(null)} />
          <MenuItem
            icon={<Sparkles className="h-4 w-4" />}
            title="Sugerencias"
            hint="La IA sugiere, tú envías."
            disabled={settings?.ai_enabled === false}
            onClick={() => void generate()}
          />
          <MenuItem icon={<Bot className="h-4 w-4" />} title="Agente de IA" hint="Responde solo · próximamente." disabled onClick={() => undefined} />
        </div>
      )}
      {tool === "quick" && (
        <FloatingCard title="Respuestas rápidas" onClose={() => setTool(null)}>
          {quickReplies.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Créalas en Ajustes de Conversaciones (botón ⚙). Luego escribe “/atajo”.</p>
          ) : (
            quickReplies.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setText(fillQuick(q.body, patientFirstName, organization?.name ?? ""));
                  setTool(null);
                  textareaRef.current?.focus();
                }}
                className="block w-full rounded-lg px-2 py-2 text-left hover:bg-muted"
              >
                <strong className="block text-xs">
                  /{q.shortcut} · {q.title}
                </strong>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">{q.body}</span>
              </button>
            ))
          )}
        </FloatingCard>
      )}
      {tool === "template" && (
        <TemplatePicker
          templates={templates}
          conversation={conversation}
          patientFirstName={patientFirstName}
          clinicName={organization?.name ?? ""}
          onClose={() => setTool(null)}
          onDone={refresh}
        />
      )}
      {tool === "schedule" && (
        <ScheduleCard
          conversation={conversation}
          text={text}
          timezone={timezone}
          patientFirstName={patientFirstName}
          clinicName={organization?.name ?? ""}
          onClose={() => setTool(null)}
          onScheduled={() => {
            setText("");
            setTool(null);
            qc.invalidateQueries({ queryKey: inboxKeys.scheduled(conversation.id) });
          }}
        />
      )}
      {slashMatches.length > 0 && tool === null && (
        <FloatingCard title="Respuestas rápidas" onClose={() => setText("")}>
          {slashMatches.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setText(fillQuick(q.body, patientFirstName, organization?.name ?? ""))}
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
            >
              <strong className="text-xs">/{q.shortcut}</strong> <span className="text-[11px] text-muted-foreground">{q.title}</span>
            </button>
          ))}
        </FloatingCard>
      )}

      {/* ── Cuadro de texto ── */}
      <div
        className={cn(
          "rounded-xl border px-3 pb-2 pt-2.5 shadow-sm",
          noteMode ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10" : "border-border bg-background",
        )}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          disabled={!windowOpen && !noteMode}
          placeholder={
            noteMode
              ? "Nota interna para el equipo (la paciente no la ve)…"
              : windowOpen
                ? "Escribe un mensaje… (/ para respuestas rápidas)"
                : "Ventana de 24 h cerrada: usa una plantilla"
          }
          aria-label="Escribir mensaje"
          className="block max-h-[180px] w-full resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <div className="mt-1.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setTool(tool === "ai" ? null : "ai")}
            className="mr-1 grid h-8 w-8 place-items-center rounded-full p-[2px]"
            style={{ background: "conic-gradient(#fd80ba, #7a7df8, #4ee1ca, #ffc66d, #fd80ba)" }}
            aria-label="Yendy IA"
            title="Yendy IA"
            disabled={noteMode}
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-background">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </span>
          </button>
          <ToolButton active={tool === "quick"} label="Respuestas rápidas" onClick={() => setTool(tool === "quick" ? null : "quick")}>
            <Zap className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "template"} label="Plantillas" onClick={() => setTool(tool === "template" ? null : "template")}>
            <FileText className="h-4 w-4" />
          </ToolButton>
          {conversation.patient_id ? (
            <Link
              href={`/scheduler?patient_id=${conversation.patient_id}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/80 hover:bg-muted"
              title="Agendar cita (abre la agenda con la paciente)"
              aria-label="Agendar cita"
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
          ) : (
            <ToolButton active={false} label="Agendar (vincula la ficha primero)" onClick={() => toast.info("Vincula o crea la ficha de la paciente en el panel derecho para agendar.")}>
              <CalendarDays className="h-4 w-4" />
            </ToolButton>
          )}
          <ToolButton active={tool === "schedule"} label="Programar mensaje" onClick={() => setTool(tool === "schedule" ? null : "schedule")}>
            <Clock className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={noteMode} label={noteMode ? "Volver a mensaje" : "Nota interna"} onClick={() => setNoteMode((v) => !v)}>
            <StickyNote className="h-4 w-4" />
          </ToolButton>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || sending || (!windowOpen && !noteMode)}
            className={cn(
              "ml-auto grid h-8 w-8 place-items-center rounded-lg transition-colors",
              text.trim() && (windowOpen || noteMode) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
            aria-label={noteMode ? "Guardar nota" : "Enviar mensaje"}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </footer>
  );
}

function fillQuick(body: string, firstName: string, clinic: string): string {
  return body.replace(/\{\{\s*nombre\s*\}\}/gi, firstName || "").replace(/\{\{\s*clinica\s*\}\}/gi, clinic);
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid h-8 w-8 place-items-center rounded-lg text-foreground/80 hover:bg-muted", active && "bg-muted text-foreground")}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="grid w-6 place-items-center">{icon}</span>
      <span>
        <strong className="block text-xs">{title}</strong>
        <small className="block text-[10px] text-zinc-400">{hint}</small>
      </span>
    </button>
  );
}

function FloatingCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute bottom-[calc(100%-4px)] left-4 z-20 max-h-80 w-80 overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-2xl">
      <div className="mb-1 flex items-center justify-between px-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

const VAR_LABEL: Record<string, string> = {
  paciente_nombre: "Nombre de la paciente",
  clinica_nombre: "Nombre de la clínica",
  fecha_cita: "Fecha de la cita",
  hora_cita: "Hora de la cita",
  servicio: "Servicio",
  doctor_nombre: "Doctor(a)",
  clinica_telefono: "Teléfono de la clínica",
  monto_pagado: "Monto",
  paciente_dni: "DNI",
  paciente_telefono: "Teléfono",
};

function TemplatePicker({
  templates,
  conversation,
  patientFirstName,
  clinicName,
  onClose,
  onDone,
}: {
  templates: ApprovedTemplate[];
  conversation: ConversationRow;
  patientFirstName: string;
  clinicName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<ApprovedTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function pick(t: ApprovedTemplate) {
    setSelected(t);
    const v: Record<string, string> = {};
    for (const name of Object.values(t.variable_mapping ?? {})) {
      v[name] = name === "paciente_nombre" ? patientFirstName : name === "clinica_nombre" ? clinicName : "";
    }
    setVars(v);
  }

  const preview = selected
    ? selected.body_text.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => {
        const name = selected.variable_mapping?.[n];
        return (name && vars[name]) || `{{${n}}}`;
      })
    : "";

  async function sendTemplate() {
    if (!selected || busy) return;
    setBusy(true);
    const res = await inboxFetch("/api/inbox/send", {
      method: "POST",
      body: {
        conversation_id: conversation.id,
        client_msg_id: crypto.randomUUID(),
        kind: "template",
        template_id: selected.id,
        template_vars: vars,
      },
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Plantilla enviada");
    onClose();
    onDone();
  }

  return (
    <FloatingCard title="Plantillas aprobadas por Meta" onClose={onClose}>
      {templates.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          No hay plantillas aprobadas. Créalas en Ajustes → WhatsApp y espera la aprobación de Meta.
        </p>
      ) : !selected ? (
        templates.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t)} className="block w-full rounded-lg px-2 py-2 text-left hover:bg-muted">
            <strong className="block text-xs">{t.meta_template_name}</strong>
            <span className="line-clamp-2 text-[11px] text-muted-foreground">{t.body_text}</span>
            <span className="text-[10px] uppercase text-muted-foreground/80">{t.category}</span>
          </button>
        ))
      ) : (
        <div className="space-y-2 px-1">
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-2 py-1.5 text-[12px]">{preview}</p>
          {Object.keys(vars).map((name) => (
            <label key={name} className="block text-[11px]">
              <span className="text-muted-foreground">{VAR_LABEL[name] ?? name}</span>
              <input
                value={vars[name]}
                onChange={(e) => setVars((v) => ({ ...v, [name]: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          ))}
          <p className="text-[10.5px] text-muted-foreground">Las plantillas tienen costo de Meta según su categoría.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
              Volver
            </button>
            <button
              type="button"
              onClick={() => void sendTemplate()}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enviar plantilla
            </button>
          </div>
        </div>
      )}
    </FloatingCard>
  );
}

function ScheduleCard({
  conversation,
  text,
  timezone,
  patientFirstName,
  clinicName,
  onClose,
  onScheduled,
}: {
  conversation: ConversationRow;
  text: string;
  timezone: string;
  patientFirstName: string;
  clinicName: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const { organizationId } = useOrganization();
  const { data: templates = [] } = useApprovedTemplates(organizationId);
  const [day, setDay] = useState(() => todayInTz(timezone));
  const [time, setTime] = useState("09:00");
  const [templateId, setTemplateId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const useTemplate = !text.trim() || templateId !== "";

  // Variables conocidas se completan solas; el resto viaja como "-".
  function templateVars(): Record<string, string> {
    const t = templates.find((x) => x.id === templateId);
    const v: Record<string, string> = {};
    for (const name of Object.values(t?.variable_mapping ?? {})) {
      if (name === "paciente_nombre") v[name] = patientFirstName;
      else if (name === "clinica_nombre") v[name] = clinicName;
    }
    return v;
  }

  async function schedule() {
    const iso = orgLocalToIso(day, time, timezone);
    if (!iso) return void toast.error("Fecha u hora inválida");
    setBusy(true);
    const res = await inboxFetch("/api/inbox/scheduled", {
      method: "POST",
      body: useTemplate
        ? { conversation_id: conversation.id, kind: "template", template_id: templateId, template_vars: templateVars(), send_at: iso }
        : { conversation_id: conversation.id, kind: "text", body: text.trim(), send_at: iso },
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Mensaje programado");
    onScheduled();
  }

  return (
    <div className="absolute bottom-[calc(100%-4px)] right-4 z-20 w-[340px] rounded-2xl border border-border bg-popover p-4 shadow-2xl">
      <button type="button" onClick={onClose} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
        <X className="h-4 w-4" />
      </button>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </span>
        Programar mensaje
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {text.trim() && !templateId
          ? "Se enviará el texto del cuadro. Si para entonces pasaron 24 h desde el último mensaje de la paciente, quedará en espera hasta que elijas una plantilla."
          : "Elige una plantilla (funciona aunque la ventana de 24 h esté cerrada)."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input type="date" value={day} min={todayInTz(timezone)} onChange={(e) => setDay(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
      </div>
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        <option value="">{text.trim() ? "Usar el texto escrito" : "— Elige una plantilla —"}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            Plantilla: {t.meta_template_name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-muted-foreground">Hora de la clínica ({timezone}).</p>
      <button
        type="button"
        onClick={() => void schedule()}
        disabled={busy || (useTemplate && !templateId)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Programar
      </button>
    </div>
  );
}
