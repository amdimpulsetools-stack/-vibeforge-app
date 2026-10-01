import { z } from "zod";

/**
 * Flows de Conversaciones (mig 281): forma de un flow. Isomórfico: lo usan
 * el editor (fase 2), la API y el motor. Sin imports de servidor.
 *
 * Un flow = UN disparador + un grafo de nodos con aristas por salida
 * (`next`, `yes`, `no`, `reply`, `timeout`, `fallback`, `btn:<id>`,
 * `row:<id>`). Los límites de botones y listas son los de Meta.
 */

export const TRIGGER_KINDS = ["new_conversation", "keyword", "no_reply", "template_button", "manual"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

const keyword = z.string().trim().min(1).max(60);

export const TriggerSchema = z.object({
  kind: z.enum(TRIGGER_KINDS),
  /** keyword: palabras (normalizadas: minúsculas, sin tildes). */
  keywords: z.array(keyword).max(30).default([]),
  match: z.enum(["contains", "exact"]).default("contains"),
  /** new_conversation: también si vuelve a escribir tras N días de silencio. */
  silence_days: z.number().int().min(1).max(365).default(30),
  /** no_reply: minutos sin respuesta del equipo. */
  minutes: z.number().int().min(5).max(1440).default(30),
  only_business_hours: z.boolean().default(true),
  /** template_button: payloads / ids de botón que lo disparan. */
  payloads: z.array(z.string().trim().min(1).max(256)).max(20).default([]),
  /** No volver a disparar este flow en la misma conversación antes de N horas. */
  cooldown_hours: z.number().int().min(0).max(720).default(4),
});
export type Trigger = z.infer<typeof TriggerSchema>;

const text4096 = z.string().trim().min(1).max(4096);
const nodeId = z.string().min(1).max(64);
const position = z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 });

const ButtonSchema = z.object({ id: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(20) });
const RowSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(24),
  description: z.string().trim().max(72).optional(),
});

export const NodeSchema = z.discriminatedUnion("type", [
  z.object({ id: nodeId, type: z.literal("trigger"), position, data: z.object({}).passthrough().default({}) }),
  z.object({ id: nodeId, type: z.literal("send_text"), position, data: z.object({ text: text4096 }) }),
  z.object({
    id: nodeId,
    type: z.literal("ask_buttons"),
    position,
    data: z.object({
      text: z.string().trim().min(1).max(1024),
      buttons: z.array(ButtonSchema).min(1).max(3),
      timeout_minutes: z.number().int().min(1).max(10080).default(60),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("ask_list"),
    position,
    data: z.object({
      text: text4096,
      button_label: z.string().trim().min(1).max(20).default("Ver opciones"),
      rows: z.array(RowSchema).min(1).max(10),
      timeout_minutes: z.number().int().min(1).max(10080).default(60),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("wait"),
    position,
    data: z.object({
      mode: z.enum(["delay", "reply"]).default("delay"),
      /** delay: cuánto esperar. reply: tiempo máximo antes de `timeout`. */
      minutes: z.number().int().min(1).max(10080).default(30),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("condition"),
    position,
    data: z.object({
      check: z.enum(["keyword", "has_tag", "has_patient", "window_open", "business_hours"]),
      keywords: z.array(keyword).max(30).default([]),
      tag_id: z.string().uuid().nullable().default(null),
    }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("send_template"),
    position,
    data: z.object({ template_id: z.string().uuid(), vars: z.record(z.string(), z.string().max(500)).default({}) }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("tag"),
    position,
    data: z.object({ action: z.enum(["add", "remove"]).default("add"), tag_id: z.string().uuid() }),
  }),
  z.object({
    id: nodeId,
    type: z.literal("notify"),
    position,
    data: z.object({
      target: z.enum(["reception", "user"]).default("reception"),
      user_id: z.string().uuid().nullable().default(null),
      note: z.string().trim().max(300).default(""),
      /** Además de avisar, pausa el bot (la persona toma el chat). */
      pause_bot: z.boolean().default(true),
    }),
  }),
  z.object({ id: nodeId, type: z.literal("handoff"), position, data: z.object({ note: z.string().trim().max(300).default("") }) }),
  z.object({ id: nodeId, type: z.literal("end"), position, data: z.object({}).passthrough().default({}) }),
]);
export type FlowNode = z.infer<typeof NodeSchema>;
export type NodeType = FlowNode["type"];

export const EdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: nodeId,
  sourceHandle: z.string().min(1).max(80).default("next"),
  target: nodeId,
});
export type FlowEdge = z.infer<typeof EdgeSchema>;

export const DefinitionSchema = z.object({
  nodes: z.array(NodeSchema).min(1).max(200),
  edges: z.array(EdgeSchema).max(600),
});
export type FlowDefinition = z.infer<typeof DefinitionSchema>;

export const FLOW_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export const NODE_LABEL: Record<NodeType, string> = {
  trigger: "Disparador",
  send_text: "Enviar mensaje",
  ask_buttons: "Pregunta con botones",
  ask_list: "Pregunta con lista",
  wait: "Esperar",
  condition: "Condición",
  send_template: "Enviar plantilla",
  tag: "Etiqueta",
  notify: "Avisar y asignar",
  handoff: "Pasar a una persona",
  end: "Fin",
};

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  new_conversation: "Conversación nueva",
  keyword: "Palabra clave",
  no_reply: "Sin respuesta del equipo",
  template_button: "Botón de plantilla",
  manual: "Manual",
};

/** Salidas que admite cada nodo (para el validador y el editor). */
export function outputsOf(node: FlowNode): string[] {
  switch (node.type) {
    case "trigger":
    case "send_text":
    case "send_template":
    case "tag":
    case "notify":
      return ["next"];
    case "ask_buttons":
      return [...node.data.buttons.map((b) => `btn:${b.id}`), "fallback", "timeout"];
    case "ask_list":
      return [...node.data.rows.map((r) => `row:${r.id}`), "fallback", "timeout"];
    case "wait":
      return node.data.mode === "delay" ? ["next"] : ["reply", "timeout"];
    case "condition":
      return ["yes", "no"];
    case "handoff":
    case "end":
      return [];
  }
}

/** Salidas que DEBEN estar conectadas para publicar. */
export function requiredOutputsOf(node: FlowNode): string[] {
  switch (node.type) {
    case "trigger":
      return ["next"];
    case "ask_buttons":
      return node.data.buttons.map((b) => `btn:${b.id}`);
    case "ask_list":
      return node.data.rows.map((r) => `row:${r.id}`);
    case "condition":
      return ["yes", "no"];
    default:
      return [];
  }
}

/** Minúsculas, sin tildes, espacios colapsados: así se comparan palabras clave y respuestas. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordMatches(text: string | null | undefined, keywords: string[], match: "contains" | "exact"): string | null {
  const t = normalizeText(text);
  if (!t) return null;
  for (const k of keywords) {
    const nk = normalizeText(k);
    if (!nk) continue;
    if (match === "exact" ? t === nk : t.includes(nk)) return k;
  }
  return null;
}

/** Variables de los textos del bot (mismas que las respuestas rápidas). */
export function fillVars(text: string, vars: { nombre?: string | null; clinica?: string | null }): string {
  return text
    .replace(/\{\{\s*nombre\s*\}\}/gi, (vars.nombre ?? "").trim())
    .replace(/\{\{\s*clinica\s*\}\}/gi, (vars.clinica ?? "").trim())
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
