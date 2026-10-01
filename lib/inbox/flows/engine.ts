import { fillVars, keywordMatches, normalizeText, type FlowDefinition, type FlowNode } from "./schema";

/**
 * Motor puro de Flows (mig 281): `step(definition, state, event, env)` →
 * `{ state, effects, trace }`. Sin I/O: el runtime (runtime.ts) aplica los
 * efectos (enviar, etiquetar, avisar, pausar) y el modo Probar los pinta.
 * Así producción, pruebas unitarias y el simulador corren el MISMO código.
 *
 * Reglas duras del diseño (§3.3) que viven aquí:
 *   · fuera de la ventana de 24 h solo pasa un nodo Plantilla; cualquier
 *     otro envío termina el run con motivo visible ("ventana_cerrada");
 *   · horario silencioso: los envíos esperan a la próxima apertura;
 *   · tope de 200 pasos por run y de 12 nodos por invocación;
 *   · el primer mensaje del bot lleva el aviso de "asistente virtual".
 */

export type RunStatus = "running" | "waiting_reply" | "waiting_delay" | "handed_off" | "done" | "failed";

export interface RunState {
  status: RunStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;
  steps: number;
  /** Cuándo despertar (esperas y tiempos agotados). ISO. */
  wakeAt: string | null;
  endReason: string | null;
}

export type FlowEvent =
  | { type: "start" }
  | { type: "inbound"; text: string | null; interactiveId: string | null }
  | { type: "timer" };

export interface Env {
  now: Date;
  windowOpen: boolean;
  businessHoursOpen: boolean;
  hasPatient: boolean;
  tagIds: string[];
  patientFirstName: string | null;
  clinicName: string;
  /** Aviso de asistente virtual (null = sin aviso). */
  disclosure: string | null;
  /** Si estamos en horario silencioso: hasta cuándo. null = no. */
  quietUntil: Date | null;
}

export type Effect =
  | { kind: "send_text"; nodeId: string; text: string }
  | { kind: "send_buttons"; nodeId: string; text: string; buttons: Array<{ id: string; title: string }> }
  | { kind: "send_list"; nodeId: string; text: string; buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> }
  | { kind: "send_template"; nodeId: string; templateId: string; vars: Record<string, string> }
  | { kind: "tag"; nodeId: string; action: "add" | "remove"; tagId: string }
  | { kind: "notify"; nodeId: string; target: "reception" | "user"; userId: string | null; note: string }
  | { kind: "pause"; nodeId: string; reason: string };

export interface StepResult {
  state: RunState;
  effects: Effect[];
  trace: Array<{ nodeId: string; type: FlowNode["type"]; out?: string; note?: string }>;
}

export const MAX_STEPS_PER_RUN = 200;
export const MAX_NODES_PER_INVOCATION = 12;

export function initialState(): RunState {
  return { status: "running", currentNodeId: null, context: {}, steps: 0, wakeAt: null, endReason: null };
}

const isoPlusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000).toISOString();

export function step(def: FlowDefinition, prev: RunState, event: FlowEvent, env: Env): StepResult {
  const nodes = new Map(def.nodes.map((n) => [n.id, n]));
  const edgeOut = (nodeId: string, handle: string): string | null =>
    def.edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null;

  const state: RunState = { ...prev, context: { ...prev.context }, status: "running", wakeAt: null };
  // La toma en base (wa_flow_claim_*) pone status 'running' y guarda de
  // dónde venía en context.resume_from; el motor decide con eso.
  const resumedFrom = ((prev.context.resume_from as RunStatus | undefined) ?? prev.status) as RunStatus;
  delete state.context.resume_from;
  const effects: Effect[] = [];
  const trace: StepResult["trace"] = [];
  const finish = (status: RunStatus, reason: string): StepResult => {
    state.status = status;
    state.endReason = reason;
    state.wakeAt = null;
    return { state, effects, trace };
  };

  // ── 1. ¿Desde qué nodo seguimos? ──
  let nextId: string | null = null;
  if (event.type === "start") {
    const trigger = def.nodes.find((n) => n.type === "trigger");
    if (!trigger) return finish("failed", "sin_disparador");
    trace.push({ nodeId: trigger.id, type: "trigger", out: "next" });
    nextId = edgeOut(trigger.id, "next");
    if (!nextId) return finish("done", "fin");
  } else {
    const cur = prev.currentNodeId ? nodes.get(prev.currentNodeId) : undefined;
    if (!cur) return finish("failed", "nodo_perdido");
    if (event.type === "inbound") {
      state.context.last_reply_text = event.text;
      state.context.last_reply_id = event.interactiveId;
      if (cur.type === "ask_buttons" || cur.type === "ask_list") {
        const out = resolveAnswer(cur, event);
        const answers = (state.context.answers as Record<string, string> | undefined) ?? {};
        answers[cur.id] = out ?? "fallback";
        state.context.answers = answers;
        const handle = out ?? "fallback";
        trace.push({ nodeId: cur.id, type: cur.type, out: handle });
        nextId = edgeOut(cur.id, handle);
        if (!nextId) return finish("done", out ? "fin" : "sin_salida_otra_respuesta");
      } else if (cur.type === "wait" && cur.data.mode === "reply") {
        trace.push({ nodeId: cur.id, type: "wait", out: "reply" });
        nextId = edgeOut(cur.id, "reply");
        if (!nextId) return finish("done", "fin");
      } else {
        // Un entrante mientras el bot hacía otra cosa (p. ej. esperaba un
        // tiempo): se guarda el texto y se sigue donde estaba.
        nextId = cur.id;
      }
    } else {
      // timer
      if (resumedFrom === "waiting_delay" && cur.type !== "wait") {
        // Envío que esperaba el fin del horario silencioso o el presupuesto
        // de nodos: se ejecuta el nodo pendiente.
        nextId = cur.id;
      } else if (cur.type === "ask_buttons" || cur.type === "ask_list" || (cur.type === "wait" && cur.data.mode === "reply")) {
        trace.push({ nodeId: cur.id, type: cur.type, out: "timeout" });
        nextId = edgeOut(cur.id, "timeout");
        if (!nextId) return finish("done", "tiempo_agotado");
      } else if (cur.type === "wait") {
        trace.push({ nodeId: cur.id, type: "wait", out: "next" });
        nextId = edgeOut(cur.id, "next");
        if (!nextId) return finish("done", "fin");
      } else {
        // Run colgado a mitad de un nodo: se ejecuta el nodo actual.
        nextId = cur.id;
      }
    }
  }

  // ── 2. Ejecutar nodos hasta una espera o el fin ──
  let budget = MAX_NODES_PER_INVOCATION;
  const vars = { nombre: env.patientFirstName, clinica: env.clinicName };
  const withDisclosure = (text: string): string => {
    if (!env.disclosure || state.context.disclosed) return text;
    state.context.disclosed = true;
    return `${env.disclosure.trim()}\n\n${text}`;
  };
  const sendsNeedWindow = (node: FlowNode): boolean => node.type === "send_text" || node.type === "ask_buttons" || node.type === "ask_list";

  while (nextId) {
    const node = nodes.get(nextId);
    if (!node) return finish("failed", "nodo_perdido");
    state.currentNodeId = node.id;
    if (state.steps >= MAX_STEPS_PER_RUN) return finish("failed", "tope_pasos");
    if (budget-- <= 0) {
      // Demasiados nodos seguidos: el tick continúa en un minuto.
      state.status = "waiting_delay";
      state.wakeAt = env.now.toISOString();
      return { state, effects, trace };
    }
    state.steps += 1;

    // Reglas duras antes de cualquier envío.
    if (sendsNeedWindow(node) && !env.windowOpen) {
      trace.push({ nodeId: node.id, type: node.type, note: "ventana cerrada" });
      return finish("done", "ventana_cerrada");
    }
    if ((sendsNeedWindow(node) || node.type === "send_template") && env.quietUntil && env.quietUntil > env.now) {
      state.status = "waiting_delay";
      state.wakeAt = env.quietUntil.toISOString();
      state.steps -= 1; // no cuenta: se reintenta el mismo nodo
      trace.push({ nodeId: node.id, type: node.type, note: "horario silencioso: espera" });
      return { state, effects, trace };
    }

    switch (node.type) {
      case "trigger":
        trace.push({ nodeId: node.id, type: "trigger", out: "next" });
        nextId = edgeOut(node.id, "next");
        if (!nextId) return finish("done", "fin");
        break;
      case "send_text":
        effects.push({ kind: "send_text", nodeId: node.id, text: withDisclosure(fillVars(node.data.text, vars)) });
        trace.push({ nodeId: node.id, type: node.type, out: "next" });
        nextId = edgeOut(node.id, "next");
        if (!nextId) return finish("done", "fin");
        break;
      case "ask_buttons":
        effects.push({ kind: "send_buttons", nodeId: node.id, text: withDisclosure(fillVars(node.data.text, vars)), buttons: node.data.buttons });
        trace.push({ nodeId: node.id, type: node.type, note: "espera respuesta" });
        state.status = "waiting_reply";
        state.wakeAt = isoPlusMinutes(env.now, node.data.timeout_minutes);
        return { state, effects, trace };
      case "ask_list":
        effects.push({ kind: "send_list", nodeId: node.id, text: withDisclosure(fillVars(node.data.text, vars)), buttonLabel: node.data.button_label, rows: node.data.rows });
        trace.push({ nodeId: node.id, type: node.type, note: "espera respuesta" });
        state.status = "waiting_reply";
        state.wakeAt = isoPlusMinutes(env.now, node.data.timeout_minutes);
        return { state, effects, trace };
      case "wait":
        trace.push({ nodeId: node.id, type: "wait", note: node.data.mode === "delay" ? `espera ${node.data.minutes} min` : `espera respuesta ≤ ${node.data.minutes} min` });
        state.status = node.data.mode === "delay" ? "waiting_delay" : "waiting_reply";
        state.wakeAt = isoPlusMinutes(env.now, node.data.minutes);
        return { state, effects, trace };
      case "condition": {
        const yes = evalCondition(node, state, env);
        trace.push({ nodeId: node.id, type: "condition", out: yes ? "yes" : "no" });
        nextId = edgeOut(node.id, yes ? "yes" : "no");
        if (!nextId) return finish("done", "fin");
        break;
      }
      case "send_template":
        effects.push({ kind: "send_template", nodeId: node.id, templateId: node.data.template_id, vars: node.data.vars });
        trace.push({ nodeId: node.id, type: node.type, out: "next" });
        nextId = edgeOut(node.id, "next");
        if (!nextId) return finish("done", "fin");
        break;
      case "tag":
        effects.push({ kind: "tag", nodeId: node.id, action: node.data.action, tagId: node.data.tag_id });
        trace.push({ nodeId: node.id, type: "tag", out: "next" });
        nextId = edgeOut(node.id, "next");
        if (!nextId) return finish("done", "fin");
        break;
      case "notify":
        effects.push({ kind: "notify", nodeId: node.id, target: node.data.target, userId: node.data.user_id, note: fillVars(node.data.note, vars) });
        trace.push({ nodeId: node.id, type: "notify", out: "next" });
        if (node.data.pause_bot) {
          effects.push({ kind: "pause", nodeId: node.id, reason: "aviso" });
          // Si hay algo después del aviso (p. ej. un mensaje de "ya te atienden"),
          // se ejecuta y luego termina como pasado a persona.
          nextId = edgeOut(node.id, "next");
          if (!nextId) return finish("handed_off", "persona");
          state.context.handoff_after = true;
          break;
        }
        nextId = edgeOut(node.id, "next");
        if (!nextId) return finish("done", "fin");
        break;
      case "handoff":
        if (node.data.note) effects.push({ kind: "notify", nodeId: node.id, target: "reception", userId: null, note: fillVars(node.data.note, vars) });
        effects.push({ kind: "pause", nodeId: node.id, reason: "persona" });
        trace.push({ nodeId: node.id, type: "handoff" });
        return finish("handed_off", "persona");
      case "end":
        trace.push({ nodeId: node.id, type: "end" });
        return finish(state.context.handoff_after ? "handed_off" : "done", state.context.handoff_after ? "persona" : "fin");
    }
    if (!nextId && state.context.handoff_after) return finish("handed_off", "persona");
  }
  return finish(state.context.handoff_after ? "handed_off" : "done", state.context.handoff_after ? "persona" : "fin");
}

/** Qué salida tocó la paciente: id del botón/fila, o el título escrito a mano. */
function resolveAnswer(node: Extract<FlowNode, { type: "ask_buttons" | "ask_list" }>, ev: Extract<FlowEvent, { type: "inbound" }>): string | null {
  const options = node.type === "ask_buttons"
    ? node.data.buttons.map((b) => ({ handle: `btn:${b.id}`, id: b.id, title: b.title }))
    : node.data.rows.map((r) => ({ handle: `row:${r.id}`, id: r.id, title: r.title }));
  if (ev.interactiveId) {
    // Convención del payload enviado: "<nodo>:<id>"; también se acepta el id a secas.
    const raw = ev.interactiveId;
    const hit = options.find((o) => raw === `${node.id}:${o.id}` || raw === o.id);
    if (hit) return hit.handle;
  }
  const t = normalizeText(ev.text);
  if (t) {
    const byTitle = options.find((o) => normalizeText(o.title) === t);
    if (byTitle) return byTitle.handle;
    // "1", "2", "3" también valen (teclado del celular).
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].handle;
  }
  return null;
}

function evalCondition(node: Extract<FlowNode, { type: "condition" }>, state: RunState, env: Env): boolean {
  switch (node.data.check) {
    case "keyword":
      return keywordMatches((state.context.last_reply_text as string | null) ?? null, node.data.keywords, "contains") !== null;
    case "has_tag":
      return !!node.data.tag_id && env.tagIds.includes(node.data.tag_id);
    case "has_patient":
      return env.hasPatient;
    case "window_open":
      return env.windowOpen;
    case "business_hours":
      return env.businessHoursOpen;
  }
}

/** Palabras que SIEMPRE cortan el bot y lo pasan a una persona. */
export const HUMAN_WORDS = ["persona", "humano", "asesor", "asesora", "alguien", "operador", "recepcionista"];
export function wantsHuman(text: string | null | undefined): boolean {
  const t = normalizeText(text);
  if (!t) return false;
  return HUMAN_WORDS.some((w) => t === w || t.split(" ").includes(w));
}

/** STOP / BAJA / "no me escribas": la paciente no quiere automáticos. */
const OPT_OUT_PATTERNS = [/^(stop|baja|cancelar|salir)$/, /no (me )?(escrib|mand|envi)/, /dej(a|en) de (escribir|mandar|enviar)/, /(quitar|borrar|sacar)me? de (la )?lista/];
export function wantsOptOut(text: string | null | undefined): boolean {
  const t = normalizeText(text);
  if (!t) return false;
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}
