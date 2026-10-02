"use client";

import { createContext, memo, useContext } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, Bot, Clock, FileText, GitBranch, Hand, ListChecks, MessageSquare, MousePointerClick, Square, Tag, UserRound, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_LABEL, TRIGGER_LABEL, type NodeType, type Trigger } from "@/lib/inbox/flows/schema";

/**
 * Nodos del editor de Flows (React Flow 12). Tarjetas compactas, una
 * entrada a la izquierda y una salida por cada rama a la derecha. Nada
 * de estado propio: todo vive en el canvas (60 fps: solo re-renderiza
 * la tarjeta cuyo data cambió; memo + contexto para errores).
 */

export type EditorNode = Node<Record<string, unknown>, NodeType>;

export const EditorCtx = createContext<{ errorIds: Set<string>; trigger: Trigger | null; counts: Record<string, number> }>({ errorIds: new Set(), trigger: null, counts: {} });

export const NODE_STYLE: Record<NodeType, { icon: React.ComponentType<{ className?: string }>; ring: string; chip: string }> = {
  trigger: { icon: Zap, ring: "border-violet-400/60", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  send_text: { icon: MessageSquare, ring: "border-emerald-400/60", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  ask_buttons: { icon: MousePointerClick, ring: "border-sky-400/60", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  ask_list: { icon: ListChecks, ring: "border-sky-400/60", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  wait: { icon: Clock, ring: "border-amber-400/60", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  condition: { icon: GitBranch, ring: "border-amber-400/60", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  send_template: { icon: FileText, ring: "border-emerald-400/60", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  tag: { icon: Tag, ring: "border-teal-400/60", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  notify: { icon: UserRound, ring: "border-rose-400/60", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  handoff: { icon: Hand, ring: "border-rose-400/60", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  end: { icon: Square, ring: "border-border", chip: "bg-muted text-muted-foreground" },
};

/** Salidas con etiqueta legible, tolerante a data incompleta (mientras se edita). */
export function outputsLoose(type: NodeType, data: Record<string, unknown>): Array<{ handle: string; label: string }> {
  switch (type) {
    case "trigger":
    case "send_text":
    case "send_template":
    case "tag":
    case "notify":
      return [{ handle: "next", label: "siguiente" }];
    case "ask_buttons": {
      const buttons = (data.buttons as Array<{ id: string; title: string }> | undefined) ?? [];
      return [...buttons.map((b) => ({ handle: `btn:${b.id}`, label: b.title || b.id })), { handle: "fallback", label: "otra respuesta" }, { handle: "timeout", label: "sin respuesta" }];
    }
    case "ask_list": {
      const rows = (data.rows as Array<{ id: string; title: string }> | undefined) ?? [];
      return [...rows.map((r) => ({ handle: `row:${r.id}`, label: r.title || r.id })), { handle: "fallback", label: "otra respuesta" }, { handle: "timeout", label: "sin respuesta" }];
    }
    case "wait":
      return data.mode === "reply" ? [{ handle: "reply", label: "respondió" }, { handle: "timeout", label: "tiempo" }] : [{ handle: "next", label: "siguiente" }];
    case "condition":
      return [{ handle: "yes", label: "sí" }, { handle: "no", label: "no" }];
    case "handoff":
    case "end":
      return [];
  }
}

function summary(type: NodeType, data: Record<string, unknown>, trigger: Trigger | null): string {
  switch (type) {
    case "trigger": {
      if (!trigger) return "Elige cuándo arranca";
      const base = TRIGGER_LABEL[trigger.kind];
      if (trigger.kind === "keyword") return trigger.keywords.length ? `${base}: ${trigger.keywords.slice(0, 3).join(", ")}${trigger.keywords.length > 3 ? "…" : ""}` : `${base}: sin palabras`;
      if (trigger.kind === "no_reply") return `${base}: ${trigger.minutes} min${trigger.only_business_hours ? " (en horario)" : ""}`;
      if (trigger.kind === "template_button") return `${base}: ${trigger.payloads.join(", ") || "sin botones"}`;
      return base;
    }
    case "send_text":
      return (data.text as string) || "Escribe el mensaje…";
    case "ask_buttons":
    case "ask_list":
      return (data.text as string) || "Escribe la pregunta…";
    case "wait":
      return data.mode === "reply" ? `Hasta que escriba (máx. ${data.minutes ?? 30} min)` : `${data.minutes ?? 30} min`;
    case "condition": {
      const c = data.check as string;
      return { keyword: `Dijo: ${((data.keywords as string[]) ?? []).join(", ") || "…"}`, has_tag: "Tiene la etiqueta", has_patient: "Tiene ficha de paciente", window_open: "Ventana de 24 h abierta", business_hours: "Dentro del horario" }[c] ?? "Elige una condición";
    }
    case "send_template":
      return data.template_id ? "Plantilla aprobada" : "Elige la plantilla…";
    case "tag":
      return data.action === "remove" ? "Quitar etiqueta" : "Poner etiqueta";
    case "notify":
      return `${data.target === "user" ? "A una persona" : "A recepción"}${data.pause_bot === false ? "" : " · pausa el bot"}`;
    case "handoff":
      return (data.note as string) || "El bot termina; una persona sigue";
    case "end":
      return "Termina sin pausar";
  }
}

function FlowNodeCardInner({ id, type, data, selected }: NodeProps<EditorNode>) {
  const { errorIds, trigger, counts } = useContext(EditorCtx);
  const t = (type ?? "end") as NodeType;
  const st = NODE_STYLE[t];
  const Icon = st.icon;
  const outputs = outputsLoose(t, data);
  const hasError = errorIds.has(id);
  const count = counts[id];
  return (
    <div
      className={cn(
        "w-[232px] rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow",
        st.ring,
        selected && "shadow-lg ring-2 ring-primary/50",
        hasError && "border-red-500/70",
      )}
    >
      {t !== "trigger" && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground" />}
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", st.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{NODE_LABEL[t]}</span>
        {hasError && <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Con errores" />}
        {count != null && !hasError && <span className="ml-auto rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground" title="Veces ejecutado">{count}</span>}
      </div>
      <p className="line-clamp-3 px-3 pb-2 pt-1 text-[12px] leading-snug">{summary(t, data, trigger)}</p>
      {outputs.length > 0 && (
        <ul className="border-t border-border/60 py-1">
          {outputs.map((o) => (
            <li key={o.handle} className="relative flex items-center justify-end px-3 py-0.5 text-[10.5px] text-muted-foreground">
              <span className="truncate">{o.label}</span>
              <Handle type="source" position={Position.Right} id={o.handle} className="!top-1/2 !h-3 !w-3 !border-2 !border-background !bg-primary" />
            </li>
          ))}
        </ul>
      )}
      {t === "trigger" && <Bot className="sr-only" />}
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardInner);
export const NODE_TYPES = Object.fromEntries((Object.keys(NODE_STYLE) as NodeType[]).map((k) => [k, FlowNodeCard])) as Record<NodeType, typeof FlowNodeCard>;
