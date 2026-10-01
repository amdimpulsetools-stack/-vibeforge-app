/**
 * Pruebas del motor puro de Flows (mig 281). Correr:
 *   npm run test:flows   (npx tsx scripts/flows-engine-test.ts)
 * Sin base de datos: valida los flows de fábrica y recorre el motor.
 */
import assert from "node:assert/strict";
import { step, initialState, wantsHuman, wantsOptOut, type Env } from "../lib/inbox/flows/engine";
import { validateFlow } from "../lib/inbox/flows/validate";
import { FLOW_TEMPLATES } from "../lib/inbox/flows/templates";
import { keywordMatches, fillVars, type FlowDefinition } from "../lib/inbox/flows/schema";

const now = new Date("2026-10-01T15:00:00Z");
const env = (over: Partial<Env> = {}): Env => ({
  now,
  windowOpen: true,
  businessHoursOpen: true,
  hasPatient: false,
  tagIds: [],
  patientFirstName: "Ana",
  clinicName: "Clínica Demo",
  disclosure: "Soy el asistente virtual de Clínica Demo; escribe *persona* para hablar con alguien.",
  quietUntil: null,
  ...over,
});
let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`PASS  ${name}`);
};

// 1. Las tres plantillas de fábrica validan sin errores.
for (const t of FLOW_TEMPLATES) {
  const v = validateFlow(t.trigger, t.definition);
  assert.ok(v.ok, `${t.key}: ${v.issues.map((i) => i.message).join(" | ")}`);
}
ok("F0 plantillas de fábrica válidas");

const welcome = FLOW_TEMPLATES.find((t) => t.key === "welcome")!;
const def = welcome.definition as FlowDefinition;

// 2. Bienvenida en horario: aviso + lista, espera respuesta con tiempo.
{
  const r = step(def, initialState(), { type: "start" }, env());
  assert.equal(r.state.status, "waiting_reply");
  assert.equal(r.state.currentNodeId, "menu");
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].kind, "send_list");
  assert.ok((r.effects[0] as { text: string }).text.startsWith("Soy el asistente virtual"), "primer mensaje lleva el aviso");
  assert.ok((r.effects[0] as { text: string }).text.includes("Hola Ana, gracias por escribir a Clínica Demo"), "variables rellenadas");
  assert.equal(r.state.wakeAt, new Date(now.getTime() + 120 * 60_000).toISOString(), "timeout 120 min");
  // 3. Toca "Agendar una cita" → mensaje + aviso que pausa → handed_off.
  const r2 = step(def, r.state, { type: "inbound", text: "Agendar una cita", interactiveId: "menu:cita" }, env());
  assert.equal(r2.state.status, "handed_off");
  assert.deepEqual(r2.effects.map((e) => e.kind), ["send_text", "notify", "pause"]);
  assert.ok(!(r2.effects[0] as { text: string }).text.startsWith("Soy el asistente"), "el aviso va solo una vez");
  assert.equal((r2.state.context.answers as Record<string, string>).menu, "row:cita");
  ok("F1 bienvenida: lista → botón → aviso y pasa a persona");
}

// 4. Fuera de horario: texto de cerrado + handoff.
{
  const r = step(def, initialState(), { type: "start" }, env({ businessHoursOpen: false }));
  assert.equal(r.state.status, "handed_off");
  assert.equal(r.effects[0].kind, "send_text");
  assert.ok((r.effects[0] as { text: string }).text.includes("fuera de horario"));
  ok("F2 condición de horario: rama no");
}

// 5. Respuesta escrita que coincide con el título, o un número.
{
  const r = step(def, initialState(), { type: "start" }, env());
  const a = step(def, r.state, { type: "inbound", text: "precios y servicios", interactiveId: null }, env());
  assert.equal(a.trace[0].out, "row:precios");
  const b = step(def, r.state, { type: "inbound", text: "4", interactiveId: null }, env());
  assert.equal(b.trace[0].out, "row:persona");
  assert.equal(b.state.status, "handed_off");
  const c = step(def, r.state, { type: "inbound", text: "quiero saber de botox", interactiveId: null }, env());
  assert.equal(c.trace[0].out, "fallback");
  assert.equal(c.state.status, "handed_off", "otra respuesta → pasa a persona");
  ok("F3 respuesta por título, por número y 'otra respuesta'");
}

// 6. Tiempo agotado en la pregunta → salida timeout.
{
  const r = step(def, initialState(), { type: "start" }, env());
  const t = step(def, r.state, { type: "timer" }, env());
  assert.equal(t.trace[0].out, "timeout");
  assert.equal(t.state.status, "handed_off");
  ok("F4 tiempo agotado");
}

// 7. Ventana cerrada: ningún texto sale; termina con motivo visible.
{
  const r = step(def, initialState(), { type: "start" }, env({ windowOpen: false }));
  assert.equal(r.state.status, "done");
  assert.equal(r.state.endReason, "ventana_cerrada");
  assert.equal(r.effects.length, 0);
  ok("F5 regla dura: fuera de la ventana de 24 h no sale texto");
}

// 8. Horario silencioso: el envío espera a la apertura, sin perderse.
{
  const quiet = new Date(now.getTime() + 8 * 3600_000);
  const r = step(def, initialState(), { type: "start" }, env({ quietUntil: quiet }));
  assert.equal(r.state.status, "waiting_delay");
  assert.equal(r.state.wakeAt, quiet.toISOString());
  assert.equal(r.effects.length, 0);
  // Al despertar, se ejecuta el nodo pendiente.
  const r2 = step(def, r.state, { type: "timer" }, env({ now: quiet }));
  assert.equal(r2.state.status, "waiting_reply");
  assert.equal(r2.effects[0].kind, "send_list");
  ok("F6 horario silencioso: espera y reanuda el mismo nodo");
}

// 9. Plantilla fuera de ventana sí pasa; texto después no.
{
  const d: FlowDefinition = {
    nodes: [
      { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "tpl", type: "send_template", position: { x: 0, y: 0 }, data: { template_id: "00000000-0000-0000-0000-000000000001", vars: {} } },
      { id: "txt", type: "send_text", position: { x: 0, y: 0 }, data: { text: "hola" } },
      { id: "h", type: "handoff", position: { x: 0, y: 0 }, data: { note: "" } },
    ],
    edges: [
      { id: "1", source: "t", sourceHandle: "next", target: "tpl" },
      { id: "2", source: "tpl", sourceHandle: "next", target: "txt" },
      { id: "3", source: "txt", sourceHandle: "next", target: "h" },
    ],
  };
  const r = step(d, initialState(), { type: "start" }, env({ windowOpen: false }));
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].kind, "send_template");
  assert.equal(r.state.endReason, "ventana_cerrada");
  ok("F7 plantilla pasa fuera de ventana; el texto siguiente no");
}

// 10. Ciclo sin espera: el validador lo rechaza; el motor corta por presupuesto.
{
  const d: FlowDefinition = {
    nodes: [
      { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "a", type: "tag", position: { x: 0, y: 0 }, data: { action: "add", tag_id: "00000000-0000-0000-0000-000000000002" } },
      { id: "b", type: "tag", position: { x: 0, y: 0 }, data: { action: "remove", tag_id: "00000000-0000-0000-0000-000000000002" } },
      { id: "h", type: "handoff", position: { x: 0, y: 0 }, data: { note: "" } },
    ],
    edges: [
      { id: "1", source: "t", sourceHandle: "next", target: "a" },
      { id: "2", source: "a", sourceHandle: "next", target: "b" },
      { id: "3", source: "b", sourceHandle: "next", target: "a" },
    ],
  };
  const v = validateFlow(welcome.trigger, d);
  assert.ok(!v.ok && v.issues.some((i) => i.message.includes("ciclo")), "validador detecta el ciclo");
  const r = step(d, initialState(), { type: "start" }, env());
  assert.equal(r.state.status, "waiting_delay", "corta por presupuesto de nodos y sigue en el tick");
  assert.ok(r.effects.length <= 12);
  let s = r.state;
  for (let i = 0; i < 40 && s.status !== "failed"; i++) s = step(d, s, { type: "timer" }, env()).state;
  assert.equal(s.status, "failed");
  assert.equal(s.endReason, "tope_pasos");
  ok("F8 ciclo: validador lo rechaza y el motor tiene tope de pasos");
}

// 11. Validador: faltas típicas.
{
  const base = FLOW_TEMPLATES.find((t) => t.key === "no_reply")!;
  const noHuman: FlowDefinition = { nodes: base.definition.nodes.filter((n) => n.type !== "notify"), edges: [{ id: "1", source: "t", sourceHandle: "next", target: "msg" }, { id: "2", source: "msg", sourceHandle: "next", target: "end" }] };
  const v = validateFlow(base.trigger, noHuman);
  assert.ok(v.issues.some((i) => i.message.includes("llegar a una persona")));
  const twoTriggers: FlowDefinition = { ...base.definition, nodes: [...base.definition.nodes, { id: "t2", type: "trigger", position: { x: 0, y: 0 }, data: {} }] };
  assert.ok(validateFlow(base.trigger, twoTriggers).issues.some((i) => i.message.includes("un Disparador")));
  const badKw = validateFlow({ ...base.trigger, kind: "keyword", keywords: [] }, base.definition);
  assert.ok(badKw.issues.some((i) => i.message.includes("palabra")));
  const unknownTag = validateFlow(base.trigger, {
    ...base.definition,
    nodes: [...base.definition.nodes, { id: "tg", type: "tag", position: { x: 0, y: 0 }, data: { action: "add", tag_id: "00000000-0000-0000-0000-0000000000aa" } }],
  }, { tagIds: new Set() });
  assert.ok(unknownTag.issues.some((i) => i.message.includes("etiqueta no existe")));
  ok("F9 validador: sin persona, dos disparadores, palabra clave vacía, etiqueta ajena");
}

// 12. Utilidades.
assert.equal(keywordMatches("Hola, ¿cuánto cuesta la CONSULTA?", ["consulta"], "contains"), "consulta");
assert.equal(keywordMatches("precio", ["precio"], "exact"), "precio");
assert.equal(keywordMatches("el precio", ["precio"], "exact"), null);
assert.ok(wantsHuman("quiero hablar con una persona"));
assert.ok(!wantsHuman("personal de salud"));
assert.ok(wantsOptOut("STOP"));
assert.ok(wantsOptOut("por favor no me escriban más"));
assert.ok(!wantsOptOut("no sé si ir"));
assert.equal(fillVars("Hola {{nombre}}, soy de {{clinica}}.", { nombre: null, clinica: "Demo" }), "Hola, soy de Demo.");
ok("F10 palabras clave, 'persona', opt-out y variables");

console.log(`OK  ${passed} grupos de pruebas del motor`);
