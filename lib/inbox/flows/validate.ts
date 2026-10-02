import { DefinitionSchema, NodeSchema, TriggerSchema, outputsOf, requiredOutputsOf, type FlowDefinition, type Trigger } from "./schema";

/**
 * Validación de un flow antes de publicar (y en vivo en el editor). Misma
 * función en el navegador y en el servidor. Devuelve errores (bloquean) y
 * avisos (no bloquean).
 */

export interface ValidationIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
}

export interface ValidationContext {
  /** Ids válidos de la org; si se pasan, se comprueba que los nodos no apunten a otros. */
  tagIds?: Set<string>;
  templateIds?: Set<string>;
  userIds?: Set<string>;
}

export function validateFlow(rawTrigger: unknown, rawDefinition: unknown, ctx: ValidationContext = {}): {
  ok: boolean;
  issues: ValidationIssue[];
  trigger: Trigger | null;
  definition: FlowDefinition | null;
} {
  const issues: ValidationIssue[] = [];
  const t = TriggerSchema.safeParse(rawTrigger);
  if (!t.success) {
    issues.push({ level: "error", message: `Disparador inválido: ${t.error.issues[0]?.message ?? "revisa los campos"}` });
  }
  const d = DefinitionSchema.safeParse(rawDefinition);
  if (!d.success) {
    // Un mensaje humano por nodo (no "nodes.4.data.template_id: Invalid uuid").
    const rawNodes = ((rawDefinition as { nodes?: unknown[] } | null)?.nodes ?? []) as Array<{ id?: string; type?: string }>;
    let attributed = false;
    for (const rn of rawNodes) {
      const r = NodeSchema.safeParse(rn);
      if (r.success) continue;
      attributed = true;
      const field = r.error.issues[0]?.path?.filter((x) => typeof x === "string").slice(-1)[0] as string | undefined;
      issues.push({ level: "error", nodeId: rn.id, message: friendlyFieldError(rn.type, field, r.error.issues[0]?.message) });
    }
    if (!attributed) issues.push({ level: "error", message: `Flow inválido: ${d.error.issues[0]?.message ?? "revisa los nodos"}` });
    return { ok: false, issues, trigger: t.success ? t.data : null, definition: null };
  }
  const def = d.data;
  const trigger = t.success ? t.data : null;

  if (trigger?.kind === "keyword" && trigger.keywords.length === 0) {
    issues.push({ level: "error", message: "El disparador por palabra clave necesita al menos una palabra." });
  }
  if (trigger?.kind === "template_button" && trigger.payloads.length === 0) {
    issues.push({ level: "error", message: "El disparador por botón de plantilla necesita al menos un botón (payload)." });
  }

  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  if (byId.size !== def.nodes.length) issues.push({ level: "error", message: "Hay nodos con el mismo id." });

  const triggers = def.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) {
    issues.push({ level: "error", message: triggers.length === 0 ? "Falta el nodo Disparador." : "Solo puede haber un Disparador." });
  }

  // Aristas: existen los nodos y la salida es válida; sin dos aristas por salida.
  const seenOut = new Set<string>();
  for (const e of def.edges) {
    const src = byId.get(e.source);
    if (!src) {
      issues.push({ level: "error", message: `Una conexión sale de un nodo que no existe (${e.source}).` });
      continue;
    }
    if (!byId.has(e.target)) {
      issues.push({ level: "error", nodeId: e.source, message: `Una conexión apunta a un nodo que no existe (${e.target}).` });
      continue;
    }
    if (!outputsOf(src).includes(e.sourceHandle)) {
      issues.push({ level: "error", nodeId: e.source, message: `Salida “${e.sourceHandle}” no válida para ${src.type}.` });
    }
    const key = `${e.source}|${e.sourceHandle}`;
    if (seenOut.has(key)) issues.push({ level: "error", nodeId: e.source, message: `La salida “${e.sourceHandle}” tiene dos conexiones.` });
    seenOut.add(key);
  }

  // Salidas obligatorias conectadas.
  for (const n of def.nodes) {
    for (const out of requiredOutputsOf(n)) {
      if (!seenOut.has(`${n.id}|${out}`)) {
        issues.push({ level: "error", nodeId: n.id, message: `Conecta la salida “${labelOut(out)}”.` });
      }
    }
    if ((n.type === "ask_buttons" || n.type === "ask_list") && !seenOut.has(`${n.id}|fallback`)) {
      issues.push({ level: "warning", nodeId: n.id, message: "Sin salida “otra respuesta”: si la paciente escribe algo distinto, el bot termina." });
    }
    if (n.type === "ask_buttons") {
      const titles = n.data.buttons.map((b) => b.title.toLowerCase());
      if (new Set(titles).size !== titles.length) issues.push({ level: "error", nodeId: n.id, message: "Los botones deben tener títulos distintos." });
      const ids = n.data.buttons.map((b) => b.id);
      if (new Set(ids).size !== ids.length) issues.push({ level: "error", nodeId: n.id, message: "Los botones deben tener ids distintos." });
    }
    if (n.type === "ask_list") {
      const ids = n.data.rows.map((r) => r.id);
      if (new Set(ids).size !== ids.length) issues.push({ level: "error", nodeId: n.id, message: "Las filas deben tener ids distintos." });
    }
    if (n.type === "condition" && n.data.check === "keyword" && n.data.keywords.length === 0) {
      issues.push({ level: "error", nodeId: n.id, message: "La condición por palabra clave necesita palabras." });
    }
    if (n.type === "condition" && n.data.check === "has_tag" && !n.data.tag_id) {
      issues.push({ level: "error", nodeId: n.id, message: "Elige la etiqueta que comprueba la condición." });
    }
    if (n.type === "notify" && n.data.target === "user" && !n.data.user_id) {
      issues.push({ level: "error", nodeId: n.id, message: "Elige a quién avisar." });
    }
    if (ctx.tagIds && n.type === "tag" && !ctx.tagIds.has(n.data.tag_id)) {
      issues.push({ level: "error", nodeId: n.id, message: "La etiqueta no existe en esta clínica." });
    }
    if (ctx.tagIds && n.type === "condition" && n.data.tag_id && !ctx.tagIds.has(n.data.tag_id)) {
      issues.push({ level: "error", nodeId: n.id, message: "La etiqueta de la condición no existe en esta clínica." });
    }
    if (ctx.templateIds && n.type === "send_template" && !ctx.templateIds.has(n.data.template_id)) {
      issues.push({ level: "error", nodeId: n.id, message: "La plantilla no existe o no está aprobada." });
    }
    if (ctx.userIds && n.type === "notify" && n.data.user_id && !ctx.userIds.has(n.data.user_id)) {
      issues.push({ level: "error", nodeId: n.id, message: "La persona a avisar no es miembro de la clínica." });
    }
  }

  // Alcanzabilidad desde el disparador y camino a una persona.
  if (triggers.length === 1) {
    const adj = new Map<string, string[]>();
    for (const e of def.edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    const reached = new Set<string>();
    const stack = [triggers[0].id];
    while (stack.length) {
      const id = stack.pop() as string;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const nxt of adj.get(id) ?? []) stack.push(nxt);
    }
    for (const n of def.nodes) {
      if (!reached.has(n.id)) issues.push({ level: "warning", nodeId: n.id, message: "Este nodo no está conectado al disparador: nunca se ejecutará." });
    }
    const canReachHuman = def.nodes.some((n) => reached.has(n.id) && (n.type === "handoff" || (n.type === "notify" && n.data.pause_bot)));
    if (!canReachHuman) {
      issues.push({ level: "error", message: "Todo flow debe poder llegar a una persona: añade “Pasar a una persona” o “Avisar y asignar” (política de Meta)." });
    }
    // Ciclos sin espera ni pregunta → bucle sin freno.
    const waits = new Set(def.nodes.filter((n) => n.type === "wait" || n.type === "ask_buttons" || n.type === "ask_list").map((n) => n.id));
    const color = new Map<string, 0 | 1 | 2>();
    const dfs = (id: string, viaWait: boolean): boolean => {
      const c = color.get(id) ?? 0;
      if (c === 1) return !viaWait;
      if (c === 2) return false;
      color.set(id, 1);
      for (const nxt of adj.get(id) ?? []) {
        if (dfs(nxt, viaWait || waits.has(id))) return true;
      }
      color.set(id, 2);
      return false;
    };
    for (const n of def.nodes) {
      color.clear();
      if (dfs(n.id, false)) {
        issues.push({ level: "error", nodeId: n.id, message: "Hay un ciclo sin Esperar ni Pregunta: el bot daría vueltas sin parar." });
        break;
      }
    }
  }

  return { ok: !issues.some((i) => i.level === "error"), issues, trigger, definition: def };
}

function labelOut(out: string): string {
  if (out.startsWith("btn:")) return `botón ${out.slice(4)}`;
  if (out.startsWith("row:")) return `fila ${out.slice(4)}`;
  return { next: "siguiente", yes: "sí", no: "no", reply: "respondió", timeout: "tiempo", fallback: "otra respuesta" }[out] ?? out;
}

function friendlyFieldError(type: string | undefined, field: string | undefined, zodMessage: string | undefined): string {
  const byField: Record<string, string> = {
    text: type === "send_text" ? "Escribe el mensaje." : "Escribe la pregunta.",
    template_id: "Elige la plantilla aprobada.",
    tag_id: "Elige la etiqueta.",
    buttons: "Añade entre 1 y 3 botones, con título (máx. 20 letras).",
    rows: "Añade entre 1 y 10 opciones, con título (máx. 24 letras).",
    title: "Cada opción necesita un título (botones: 20 letras; filas: 24).",
    button_label: "El botón de la lista necesita un texto (máx. 20 letras).",
    user_id: "Elige a quién avisar.",
    seconds: "Revisa los segundos (escribiendo…: 1 a 25).",
    minutes: "Revisa los minutos.",
    keywords: "Revisa las palabras clave.",
    data: zodMessage ?? "Revisa los campos del nodo.",
  };
  return byField[field ?? ""] ?? `Revisa el campo “${field ?? "?"}”: ${zodMessage ?? "valor inválido"}.`;
}
