import type { FlowDefinition, Trigger } from "./schema";

/**
 * Flows de fábrica (§3.4 del diseño): se crean como BORRADOR al pulsar
 * "Nuevo flow → desde plantilla". Sin ids de etiquetas/plantillas (las
 * elige la clínica en el editor); por eso usan Avisar y Pasar a persona.
 */

export interface FlowTemplate {
  key: "welcome" | "no_reply" | "confirm";
  name: string;
  description: string;
  trigger: Trigger;
  definition: FlowDefinition;
}

const P = (x: number, y: number) => ({ x, y });

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: "welcome",
    name: "Bienvenida con menú",
    description: "Cuando alguien escribe por primera vez: saluda, pregunta qué necesita y avisa a recepción.",
    trigger: { kind: "new_conversation", keywords: [], match: "contains", silence_days: 30, minutes: 30, only_business_hours: false, payloads: [], cooldown_hours: 24, skip_in_quiet: false },
    definition: {
      nodes: [
        { id: "t", type: "trigger", position: P(0, 0), data: {} },
        { id: "hours", type: "condition", position: P(0, 140), data: { check: "business_hours", keywords: [], tag_id: null } },
        { id: "closed", type: "send_text", position: P(-260, 300), data: { text: "Hola {{nombre}}, gracias por escribir a {{clinica}}. En este momento estamos fuera de horario; apenas abramos te respondemos con gusto." } },
        { id: "closed_end", type: "handoff", position: P(-260, 440), data: { note: "Escribió fuera de horario: responder al abrir." } },
        { id: "typing", type: "typing", position: P(220, 260), data: { seconds: 2 } },
        { id: "menu", type: "ask_list", position: P(220, 400), data: {
          text: "Hola {{nombre}}, gracias por escribir a {{clinica}}. ¿En qué te ayudo?",
          button_label: "Ver opciones",
          rows: [
            { id: "cita", title: "Agendar una cita" },
            { id: "precios", title: "Precios y servicios" },
            { id: "resultados", title: "Mis resultados" },
            { id: "persona", title: "Hablar con alguien" },
          ],
          timeout_minutes: 120,
        } },
        { id: "cita", type: "send_text", position: P(-120, 500), data: { text: "Perfecto. Cuéntame qué servicio te interesa y qué día te acomoda, y recepción te confirma el horario en breve." } },
        { id: "cita_h", type: "notify", position: P(-120, 640), data: { target: "reception", user_id: null, note: "Quiere agendar una cita.", pause_bot: true } },
        { id: "precios", type: "send_text", position: P(120, 500), data: { text: "Con gusto. Dime qué servicio te interesa y te paso el precio exacto." } },
        { id: "precios_h", type: "notify", position: P(120, 640), data: { target: "reception", user_id: null, note: "Pregunta por precios.", pause_bot: true } },
        { id: "resultados", type: "send_text", position: P(360, 500), data: { text: "Los resultados los entrega el consultorio. Recepción te escribe en breve para coordinarlo." } },
        { id: "resultados_h", type: "notify", position: P(360, 640), data: { target: "reception", user_id: null, note: "Pregunta por resultados.", pause_bot: true } },
        { id: "persona", type: "handoff", position: P(600, 500), data: { note: "Pidió hablar con una persona." } },
        { id: "otra", type: "handoff", position: P(840, 500), data: { note: "Respondió algo distinto al menú." } },
      ],
      edges: [
        { id: "e1", source: "t", sourceHandle: "next", target: "hours" },
        { id: "e2", source: "hours", sourceHandle: "no", target: "closed" },
        { id: "e3", source: "closed", sourceHandle: "next", target: "closed_end" },
        { id: "e4", source: "hours", sourceHandle: "yes", target: "typing" },
        { id: "e4b", source: "typing", sourceHandle: "next", target: "menu" },
        { id: "e5", source: "menu", sourceHandle: "row:cita", target: "cita" },
        { id: "e6", source: "cita", sourceHandle: "next", target: "cita_h" },
        { id: "e7", source: "menu", sourceHandle: "row:precios", target: "precios" },
        { id: "e8", source: "precios", sourceHandle: "next", target: "precios_h" },
        { id: "e9", source: "menu", sourceHandle: "row:resultados", target: "resultados" },
        { id: "e10", source: "resultados", sourceHandle: "next", target: "resultados_h" },
        { id: "e11", source: "menu", sourceHandle: "row:persona", target: "persona" },
        { id: "e12", source: "menu", sourceHandle: "fallback", target: "otra" },
        { id: "e13", source: "menu", sourceHandle: "timeout", target: "otra" },
      ],
    },
  },
  {
    key: "no_reply",
    name: "Nadie respondió en 30 min",
    description: "Si la paciente escribió y en 30 minutos nadie contestó (en horario): avisa a recepción y le dice que ya la vieron.",
    trigger: { kind: "no_reply", keywords: [], match: "contains", silence_days: 30, minutes: 30, only_business_hours: true, payloads: [], cooldown_hours: 4, skip_in_quiet: true },
    definition: {
      nodes: [
        { id: "t", type: "trigger", position: P(0, 0), data: {} },
        { id: "notify", type: "notify", position: P(0, 140), data: { target: "reception", user_id: null, note: "Lleva 30 min sin respuesta.", pause_bot: true } },
        { id: "msg", type: "send_text", position: P(0, 280), data: { text: "{{nombre}}, ya vimos tu mensaje; en breve te respondemos 🙂" } },
        { id: "end", type: "end", position: P(0, 420), data: {} },
      ],
      edges: [
        { id: "e1", source: "t", sourceHandle: "next", target: "notify" },
        { id: "e2", source: "notify", sourceHandle: "next", target: "msg" },
        { id: "e3", source: "msg", sourceHandle: "next", target: "end" },
      ],
    },
  },
  {
    key: "confirm",
    name: "Confirmación por botones",
    description: "Cuando la paciente toca Confirmar o Reagendar en una plantilla con botones.",
    trigger: { kind: "template_button", keywords: [], match: "contains", silence_days: 30, minutes: 30, only_business_hours: false, payloads: ["confirmar", "reagendar"], cooldown_hours: 1, skip_in_quiet: false },
    definition: {
      nodes: [
        { id: "t", type: "trigger", position: P(0, 0), data: {} },
        { id: "which", type: "condition", position: P(0, 140), data: { check: "keyword", keywords: ["confirmar", "confirmo", "sí", "si"], tag_id: null } },
        { id: "ok", type: "send_text", position: P(-200, 300), data: { text: "¡Listo, {{nombre}}! Tu cita queda confirmada. Te esperamos." } },
        { id: "ok_end", type: "end", position: P(-200, 440), data: {} },
        { id: "re", type: "send_text", position: P(200, 300), data: { text: "Sin problema, {{nombre}}. Recepción te escribe en breve para buscar un nuevo horario." } },
        { id: "re_h", type: "handoff", position: P(200, 440), data: { note: "Pidió reagendar desde el botón de la plantilla." } },
      ],
      edges: [
        { id: "e1", source: "t", sourceHandle: "next", target: "which" },
        { id: "e2", source: "which", sourceHandle: "yes", target: "ok" },
        { id: "e3", source: "ok", sourceHandle: "next", target: "ok_end" },
        { id: "e4", source: "which", sourceHandle: "no", target: "re" },
        { id: "e5", source: "re", sourceHandle: "next", target: "re_h" },
      ],
    },
  },
];
