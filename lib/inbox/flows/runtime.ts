import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgWhatsApp } from "../server";
import { sendFromInbox } from "../send";
import { isWindowOpen } from "../shared";
import { detectAlarm } from "../ai";
import { notifyOrgMembers } from "@/lib/live-notifications/notify";
import { resolveOrgTimezone, zonedNow } from "@/lib/org-time";
import { DEFAULT_DISCLOSURE_TEXT, DefinitionSchema, TriggerSchema, keywordMatches, type FlowDefinition, type Trigger, type TriggerKind } from "./schema";
import { initialState, step, wantsHuman, wantsOptOut, type Effect, type Env, type RunState, type RunStatus } from "./engine";
import { buttonsPayload, interactiveDisplayBody, listPayload } from "./wa-payloads";
import { pauseBotForHuman } from "./pause";

/**
 * Runtime de Flows (mig 281): une el motor puro con la base, Meta y el
 * resto de la bandeja. Dos entradas:
 *   · onInboundForFlows: llegó un mensaje NUEVO de la paciente (lo llama
 *     mirrorInboundToInbox, solo para filas realmente insertadas).
 *   · tickFlowRuns: el tick por minuto (cron + pestaña abierta): esperas,
 *     tiempos agotados, runs colgados y el disparador "sin respuesta".
 * Todo best-effort: un error se registra y jamás rompe el webhook ni el
 * cron. Sin la 281 aplicada, las consultas fallan en silencio y no pasa nada.
 */

interface FlowRow {
  id: string;
  name: string;
  status: string;
  priority: number;
  trigger: unknown;
  definition: unknown;
  published_version_id: string | null;
}
interface RunRow {
  id: string;
  organization_id: string;
  conversation_id: string;
  flow_id: string;
  flow_version_id: string | null;
  status: RunStatus;
  current_node_id: string | null;
  context: Record<string, unknown>;
  wake_at: string | null;
  steps: number;
  trigger_kind: string | null;
}
interface ConvRow {
  id: string;
  organization_id: string;
  phone_normalized: string | null;
  display_name: string | null;
  patient_id: string | null;
  last_inbound_at: string | null;
  last_message_dir: string | null;
  inbox_status: string;
  bot_paused_until: string | null;
  bot_opted_out: boolean;
  created_at: string;
}
interface OrgFlowSettings {
  flows_enabled: boolean;
  flows_pause_hours: number;
  flows_quiet_start: string | null;
  flows_quiet_end: string | null;
  flows_disclosure: string | null;
  timezone: string;
  clinicName: string;
  sched: { start_hour?: number; end_hour?: number; start_minute?: number; end_minute?: number; disabled_weekdays?: number[] } | null;
}

export const DEFAULT_DISCLOSURE = DEFAULT_DISCLOSURE_TEXT;
const ACTIVE: RunStatus[] = ["running", "waiting_reply", "waiting_delay"];
const CONV_COLS = "id, organization_id, phone_normalized, display_name, patient_id, last_inbound_at, last_message_dir, inbox_status, bot_paused_until, bot_opted_out, created_at";

/** uuid v5 (SHA-1) sin dependencias: client_msg_id determinista por run+nodo+paso. */
export function uuidv5(name: string): string {
  const ns = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"); // namespace DNS (cualquiera fijo sirve)
  const h = createHash("sha1").update(ns).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

async function loadOrgFlowSettings(admin: SupabaseClient, orgId: string): Promise<OrgFlowSettings | null> {
  const [{ data: s, error }, { data: org }, { data: sched }] = await Promise.all([
    admin.from("wa_inbox_settings").select("flows_enabled, flows_pause_hours, flows_quiet_start, flows_quiet_end, flows_disclosure").eq("organization_id", orgId).maybeSingle(),
    admin.from("organizations").select("name, timezone").eq("id", orgId).maybeSingle(),
    admin.from("scheduler_settings").select("start_hour, end_hour, start_minute, end_minute, disabled_weekdays").eq("organization_id", orgId).maybeSingle(),
  ]);
  if (error) return null; // 281 sin aplicar
  return {
    flows_enabled: (s?.flows_enabled as boolean | undefined) ?? true,
    flows_pause_hours: (s?.flows_pause_hours as number | undefined) ?? 12,
    flows_quiet_start: (s?.flows_quiet_start as string | null | undefined) ?? null,
    flows_quiet_end: (s?.flows_quiet_end as string | null | undefined) ?? null,
    flows_disclosure: (s?.flows_disclosure as string | null | undefined) ?? null,
    timezone: resolveOrgTimezone(org?.timezone),
    clinicName: (org?.name as string | undefined) ?? "la clínica",
    sched: (sched as OrgFlowSettings["sched"]) ?? null,
  };
}

/** ¿La agenda está abierta ahora (hora de la clínica)? Sin ajustes: siempre sí. */
export function isBusinessHoursOpen(sched: OrgFlowSettings["sched"], tz: string, now: Date): boolean {
  if (!sched || sched.start_hour == null || sched.end_hour == null) return true;
  const z = zonedNow(tz, now);
  const closed = Array.isArray(sched.disabled_weekdays) ? sched.disabled_weekdays : [];
  if (closed.includes(z.getDay())) return false;
  const minutes = z.getHours() * 60 + z.getMinutes();
  const start = sched.start_hour * 60 + (sched.start_minute ?? 0);
  const end = sched.end_hour * 60 + (sched.end_minute ?? 0);
  return minutes >= start && minutes < end;
}

/** Horario silencioso (HH:MM–HH:MM, hora de la clínica): hasta cuándo callar, o null. */
export function quietUntil(settings: OrgFlowSettings, now: Date): Date | null {
  const { flows_quiet_start: qs, flows_quiet_end: qe, timezone } = settings;
  if (!qs || !qe) return null;
  const [sh, sm] = qs.split(":").map(Number);
  const [eh, em] = qe.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  const z = zonedNow(timezone, now);
  const cur = z.getHours() * 60 + z.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  const inQuiet = s <= e ? cur >= s && cur < e : cur >= s || cur < e; // cruza medianoche
  if (!inQuiet) return null;
  const minutesUntilEnd = ((e - cur) % 1440 + 1440) % 1440 || 1;
  return new Date(now.getTime() + minutesUntilEnd * 60_000);
}

async function buildEnv(admin: SupabaseClient, settings: OrgFlowSettings, conv: ConvRow, now = new Date()): Promise<Env> {
  const { data: tags } = await admin.from("wa_conversation_tags").select("tag_id").eq("conversation_id", conv.id);
  let firstName: string | null = null;
  if (conv.patient_id) {
    const { data: p } = await admin.from("patients").select("first_name").eq("id", conv.patient_id).maybeSingle();
    firstName = (p?.first_name as string | null) ?? null;
  }
  if (!firstName) firstName = (conv.display_name ?? "").trim().split(/\s+/)[0] || null;
  const disclosureRaw = settings.flows_disclosure ?? DEFAULT_DISCLOSURE;
  return {
    now,
    windowOpen: isWindowOpen(conv.last_inbound_at, now.getTime()),
    businessHoursOpen: isBusinessHoursOpen(settings.sched, settings.timezone, now),
    hasPatient: !!conv.patient_id,
    tagIds: ((tags ?? []) as Array<{ tag_id: string }>).map((t) => t.tag_id),
    patientFirstName: firstName,
    clinicName: settings.clinicName,
    disclosure: disclosureRaw.trim() ? disclosureRaw.replace(/\{\{\s*clinica\s*\}\}/gi, settings.clinicName) : null,
    quietUntil: quietUntil(settings, now),
  };
}

// ── Efectos ─────────────────────────────────────────────────────────
async function applyEffects(admin: SupabaseClient, settings: OrgFlowSettings, conv: ConvRow, run: RunRow, effects: Effect[]): Promise<{ failed: string | null; lastMessageId: string | null }> {
  let wa: Awaited<ReturnType<typeof getOrgWhatsApp>> | undefined;
  let lastMessageId: string | null = null;
  for (const ef of effects) {
    const needsWa = ef.kind === "send_text" || ef.kind === "send_buttons" || ef.kind === "send_list" || ef.kind === "send_template";
    if (needsWa) {
      if (wa === undefined) wa = await getOrgWhatsApp(admin, conv.organization_id);
      if (!wa) return { failed: "WhatsApp no conectado", lastMessageId };
      const clientMsgId = uuidv5(`${run.id}|${ef.nodeId}|${run.steps}`);
      const base = { admin, wa, orgId: conv.organization_id, conversation: conv, clientMsgId, actorId: null, source: "flow" as const, flowRunId: run.id };
      let res;
      if (ef.kind === "send_text") res = await sendFromInbox({ ...base, kind: "text", body: ef.text });
      else if (ef.kind === "send_template") res = await sendFromInbox({ ...base, kind: "template", templateId: ef.templateId, templateVars: ef.vars });
      else if (ef.kind === "send_buttons") {
        res = await sendFromInbox({
          ...base,
          kind: "interactive",
          body: interactiveDisplayBody(ef.text, ef.buttons),
          interactive: { payload: buttonsPayload(conv.phone_normalized ?? "", ef.nodeId, ef.text, ef.buttons), meta: { type: "button", node_id: ef.nodeId, options: ef.buttons } },
        });
      } else {
        res = await sendFromInbox({
          ...base,
          kind: "interactive",
          body: interactiveDisplayBody(ef.text, ef.rows),
          interactive: { payload: listPayload(conv.phone_normalized ?? "", ef.nodeId, ef.text, ef.buttonLabel, ef.rows), meta: { type: "list", node_id: ef.nodeId, options: ef.rows } },
        });
      }
      await logEvent(admin, run, ef.nodeId, res.ok ? "sent" : "send_failed", { kind: ef.kind, ok: res.ok, error: res.ok ? null : res.error });
      if (!res.ok) return { failed: res.error, lastMessageId };
      lastMessageId = res.messageId;
      continue;
    }
    if (ef.kind === "tag") {
      if (ef.action === "add") {
        const { error } = await admin.from("wa_conversation_tags").insert({ organization_id: conv.organization_id, conversation_id: conv.id, tag_id: ef.tagId });
        if (error && error.code !== "23505") await logEvent(admin, run, ef.nodeId, "tag_failed", { error: error.message });
      } else {
        await admin.from("wa_conversation_tags").delete().eq("conversation_id", conv.id).eq("tag_id", ef.tagId);
      }
      await logEvent(admin, run, ef.nodeId, "tag", { action: ef.action, tag_id: ef.tagId });
      continue;
    }
    if (ef.kind === "notify") {
      const note = ef.note?.trim() || "El bot pide que una persona siga esta conversación.";
      // Nota interna en el hilo (el equipo la ve, la paciente no).
      const { data: noteRow } = await admin
        .from("wa_messages")
        .insert({ organization_id: conv.organization_id, conversation_id: conv.id, direction: "internal", source: "flow", type: "text", body: `🤖 ${note}`, status: "sent", ts: new Date().toISOString() })
        .select("id")
        .single();
      if (noteRow) {
        await admin.from("wa_conversations").update({ unread_count: 1, updated_at: new Date().toISOString() }).eq("id", conv.id).eq("unread_count", 0);
      }
      if (ef.target === "user" && ef.userId) {
        await admin.from("wa_conversations").update({ assigned_to: ef.userId, updated_at: new Date().toISOString() }).eq("id", conv.id);
      }
      await notifyOrgMembers(admin, {
        organizationId: conv.organization_id,
        event: "wa_flow_attention",
        title: `WhatsApp: ${conv.display_name ?? conv.phone_normalized ?? "una paciente"} necesita a una persona`,
        body: note,
        actionUrl: `/conversaciones?c=${conv.id}`,
        targetUserId: ef.target === "user" ? ef.userId ?? undefined : undefined,
      }).catch(() => undefined);
      await logEvent(admin, run, ef.nodeId, "notify", { target: ef.target, user_id: ef.userId });
      continue;
    }
    if (ef.kind === "pause") {
      await pauseBotForHuman(admin, conv.organization_id, conv.id, ef.reason === "persona" ? "persona" : "aviso", settings.flows_pause_hours);
      await logEvent(admin, run, ef.nodeId, "pause", { reason: ef.reason });
    }
  }
  return { failed: null, lastMessageId };
}

async function logEvent(admin: SupabaseClient, run: RunRow, nodeId: string | null, kind: string, payload: Record<string, unknown> = {}): Promise<void> {
  await admin.from("wa_flow_run_events").insert({ organization_id: run.organization_id, run_id: run.id, node_id: nodeId, kind, payload }).then(() => undefined, () => undefined);
}

async function persistRun(admin: SupabaseClient, run: RunRow, state: RunState, lastMessageId: string | null, failed: string | null): Promise<void> {
  const ended = state.status === "done" || state.status === "handed_off" || state.status === "failed" || failed !== null;
  await admin
    .from("wa_flow_runs")
    .update({
      status: failed ? "failed" : state.status,
      current_node_id: state.currentNodeId,
      context: state.context,
      wake_at: failed ? null : state.wakeAt,
      steps: state.steps,
      claimed_at: null,
      last_sent_message_id: lastMessageId ?? undefined,
      ended_at: ended ? new Date().toISOString() : null,
      end_reason: failed ? `error: ${failed.slice(0, 120)}` : state.endReason,
    })
    .eq("id", run.id);
}

async function runStep(admin: SupabaseClient, settings: OrgFlowSettings, conv: ConvRow, run: RunRow, def: FlowDefinition, event: Parameters<typeof step>[2]): Promise<void> {
  const env = await buildEnv(admin, settings, conv);
  const prev: RunState = { status: run.status, currentNodeId: run.current_node_id, context: run.context ?? {}, steps: run.steps, wakeAt: run.wake_at, endReason: null };
  const result = step(def, prev, event, env);
  for (const t of result.trace) await logEvent(admin, run, t.nodeId, "node", { type: t.type, out: t.out ?? null, note: t.note ?? null });
  // Pasos contados para que el client_msg_id cambie entre invocaciones.
  const runForEffects: RunRow = { ...run, steps: result.state.steps };
  const { failed, lastMessageId } = await applyEffects(admin, settings, conv, runForEffects, result.effects);
  await persistRun(admin, run, result.state, lastMessageId, failed);
}

async function loadDefinition(admin: SupabaseClient, run: RunRow): Promise<FlowDefinition | null> {
  if (run.flow_version_id) {
    const { data } = await admin.from("wa_flow_versions").select("definition").eq("id", run.flow_version_id).maybeSingle();
    const parsed = DefinitionSchema.safeParse(data?.definition);
    if (parsed.success) return parsed.data;
  }
  const { data } = await admin.from("wa_flows").select("definition").eq("id", run.flow_id).maybeSingle();
  const parsed = DefinitionSchema.safeParse(data?.definition);
  return parsed.success ? parsed.data : null;
}

// ── Entrada: llegó un mensaje nuevo ────────────────────────────────
export interface InboundForFlows {
  wamid: string;
  text: string | null;
  interactiveId: string | null;
  buttonPayload: string | null;
  receivedAt: string;
}

export async function onInboundForFlows(admin: SupabaseClient, orgId: string, conversationId: string, msg: InboundForFlows): Promise<void> {
  try {
    const settings = await loadOrgFlowSettings(admin, orgId);
    if (!settings) return; // 281 sin aplicar
    const { data: convRaw } = await admin.from("wa_conversations").select(CONV_COLS).eq("id", conversationId).maybeSingle();
    if (!convRaw) return;
    const conv = convRaw as unknown as ConvRow;
    const text = msg.text ?? "";

    // Regla 4: opt-out antes de todo.
    if (wantsOptOut(text)) {
      await admin.from("wa_conversations").update({ bot_opted_out: true, updated_at: new Date().toISOString() }).eq("id", conv.id);
      await ensureSystemTagAndApply(admin, orgId, conv.id, "No contactar", "#ef4444");
      await pauseBotForHuman(admin, orgId, conv.id, "persona", 24 * 365);
      return;
    }
    if (conv.bot_opted_out) return;

    // Regla 5: alarma → nunca contesta un menú; pasa a persona y avisa.
    if (detectAlarm(text)) {
      const { data: active } = await admin.from("wa_flow_runs").select("id, organization_id, conversation_id, flow_id, flow_version_id, status, current_node_id, context, wake_at, steps, trigger_kind").eq("conversation_id", conv.id).in("status", ACTIVE).maybeSingle();
      if (active) {
        await applyEffects(admin, settings, conv, active as RunRow, [
          { kind: "notify", nodeId: "alarma", target: "reception", userId: null, note: "Posible señal de alarma en el mensaje: revisar YA." },
          { kind: "pause", nodeId: "alarma", reason: "persona" },
        ]);
        await admin.from("wa_flow_runs").update({ status: "handed_off", ended_at: new Date().toISOString(), end_reason: "alarma", wake_at: null, claimed_at: null }).eq("id", (active as RunRow).id);
      }
      return;
    }

    // Regla 2: pausado por una persona → nada.
    if (conv.bot_paused_until && new Date(conv.bot_paused_until).getTime() > Date.now()) return;

    // ¿Había un run esperando respuesta? Toma atómica.
    const { data: claimed } = await admin.rpc("wa_flow_claim_for_inbound", { p_conversation: conv.id, p_wamid: msg.wamid });
    const run = ((claimed ?? []) as RunRow[])[0];
    if (run) {
      if (wantsHuman(text)) {
        await applyEffects(admin, settings, conv, run, [
          { kind: "notify", nodeId: run.current_node_id ?? "persona", target: "reception", userId: null, note: "La paciente pidió hablar con una persona." },
          { kind: "pause", nodeId: run.current_node_id ?? "persona", reason: "persona" },
        ]);
        await admin.from("wa_flow_runs").update({ status: "handed_off", ended_at: new Date().toISOString(), end_reason: "persona", wake_at: null, claimed_at: null }).eq("id", run.id);
        return;
      }
      const def = await loadDefinition(admin, run);
      if (!def) {
        await persistRun(admin, run, { status: "failed", currentNodeId: run.current_node_id, context: run.context, steps: run.steps, wakeAt: null, endReason: "definicion_perdida" }, null, null);
        return;
      }
      await runStep(admin, settings, conv, run, def, { type: "inbound", text: msg.text, interactiveId: msg.interactiveId ?? msg.buttonPayload });
      return;
    }

    // Sin run: ¿algún flow activo se dispara?
    if (!settings.flows_enabled) return;
    const { data: flows } = await admin.from("wa_flows").select("id, name, status, priority, trigger, definition, published_version_id").eq("organization_id", orgId).eq("status", "active").order("priority").limit(50);
    const candidates = ((flows ?? []) as FlowRow[])
      .map((f) => ({ f, trigger: TriggerSchema.safeParse(f.trigger) }))
      .filter((x): x is { f: FlowRow; trigger: { success: true; data: Trigger } } => x.trigger.success);
    const rank: Record<TriggerKind, number> = { keyword: 0, template_button: 1, new_conversation: 2, no_reply: 9, manual: 9 };
    let isNew: boolean | null = null;
    const matches: Array<{ f: FlowRow; trigger: Trigger }> = [];
    for (const { f, trigger } of candidates) {
      const t = trigger.data;
      if (t.kind === "keyword" && keywordMatches(text, t.keywords, t.match)) matches.push({ f, trigger: t });
      else if (t.kind === "template_button") {
        const id = msg.buttonPayload ?? msg.interactiveId;
        if (id && t.payloads.some((p) => p === id || p.toLowerCase() === id.toLowerCase() || id.endsWith(`:${p}`))) matches.push({ f, trigger: t });
      } else if (t.kind === "new_conversation") {
        if (isNew === null) isNew = await isNewConversation(admin, conv.id, t.silence_days);
        if (isNew) matches.push({ f, trigger: t });
      }
    }
    matches.sort((a, b) => rank[a.trigger.kind] - rank[b.trigger.kind] || a.f.priority - b.f.priority);
    for (const m of matches) {
      const started = await startRun(admin, settings, conv, m.f, m.trigger, { type: "start" });
      if (started) break;
    }
  } catch (err) {
    console.error("[Flows] entrante:", err);
  }
}

async function isNewConversation(admin: SupabaseClient, conversationId: string, silenceDays: number): Promise<boolean> {
  const { data } = await admin.from("wa_messages").select("ts").eq("conversation_id", conversationId).eq("direction", "in").order("ts", { ascending: false }).limit(2);
  const rows = (data ?? []) as Array<{ ts: string }>;
  if (rows.length < 2) return true;
  return new Date(rows[0].ts).getTime() - new Date(rows[1].ts).getTime() >= silenceDays * 86400_000;
}

async function ensureSystemTagAndApply(admin: SupabaseClient, orgId: string, conversationId: string, name: string, color: string): Promise<void> {
  const { data: tag } = await admin.from("org_tags").select("id").eq("organization_id", orgId).ilike("name", name).maybeSingle();
  let tagId = tag?.id as string | undefined;
  if (!tagId) {
    const { data: created } = await admin.from("org_tags").insert({ organization_id: orgId, name, color }).select("id").maybeSingle();
    tagId = created?.id as string | undefined;
  }
  if (tagId) await admin.from("wa_conversation_tags").insert({ organization_id: orgId, conversation_id: conversationId, tag_id: tagId }).then(() => undefined, () => undefined);
}

/** Arranca un run si la conversación no tiene otro activo y el flow respeta su cooldown. */
export async function startRun(
  admin: SupabaseClient,
  settings: OrgFlowSettings,
  conv: ConvRow,
  flow: FlowRow,
  trigger: Trigger,
  event: Parameters<typeof step>[2],
): Promise<boolean> {
  if (trigger.cooldown_hours > 0) {
    const { data: last } = await admin.from("wa_flow_runs").select("started_at").eq("conversation_id", conv.id).eq("flow_id", flow.id).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.started_at as string).getTime() < trigger.cooldown_hours * 3600_000) return false;
  }
  const def = DefinitionSchema.safeParse(flow.definition);
  if (!def.success) return false;
  const { data: created, error } = await admin
    .from("wa_flow_runs")
    .insert({ organization_id: conv.organization_id, conversation_id: conv.id, flow_id: flow.id, flow_version_id: flow.published_version_id, status: "running", claimed_at: new Date().toISOString(), trigger_kind: trigger.kind, context: {} })
    .select("id, organization_id, conversation_id, flow_id, flow_version_id, status, current_node_id, context, wake_at, steps, trigger_kind")
    .single();
  if (error || !created) return false; // 23505 = ya hay un bot activo
  const run = created as RunRow;
  await logEvent(admin, run, null, "start", { flow: flow.name, trigger: trigger.kind });
  // La versión publicada manda; el borrador solo si no hay versión.
  const published = await loadDefinition(admin, run);
  await runStep(admin, settings, conv, run, published ?? def.data, event);
  return true;
}

/** Inicio manual desde la conversación ("Iniciar flow"). */
export async function startFlowManually(admin: SupabaseClient, orgId: string, conversationId: string, flowId: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await loadOrgFlowSettings(admin, orgId);
  if (!settings) return { ok: false, error: "Falta aplicar la migración 281" };
  const [{ data: convRaw }, { data: flow }] = await Promise.all([
    admin.from("wa_conversations").select(CONV_COLS).eq("id", conversationId).eq("organization_id", orgId).maybeSingle(),
    admin.from("wa_flows").select("id, name, status, priority, trigger, definition, published_version_id").eq("id", flowId).eq("organization_id", orgId).maybeSingle(),
  ]);
  if (!convRaw || !flow) return { ok: false, error: "Conversación o flow no encontrado" };
  const conv = convRaw as unknown as ConvRow;
  if (conv.bot_opted_out) return { ok: false, error: "La paciente pidió no recibir mensajes automáticos" };
  if (flow.status !== "active") return { ok: false, error: "El flow no está publicado" };
  const trigger = TriggerSchema.safeParse(flow.trigger);
  if (!trigger.success) return { ok: false, error: "Disparador inválido" };
  await admin.from("wa_conversations").update({ bot_paused_until: null }).eq("id", conv.id);
  const started = await startRun(admin, settings, { ...conv, bot_paused_until: null }, flow as FlowRow, { ...trigger.data, cooldown_hours: 0 }, { type: "start" });
  return started ? { ok: true } : { ok: false, error: "Ya hay un bot activo en esta conversación" };
}

// ── Tick por minuto ────────────────────────────────────────────────
export async function tickFlowRuns(admin: SupabaseClient, opts: { orgId?: string | null; limit?: number } = {}): Promise<{ resumed: number; started: number }> {
  let resumed = 0;
  let started = 0;
  try {
    const { data: due, error } = await admin.rpc("wa_flow_claim_due", { p_limit: opts.limit ?? 25, p_org: opts.orgId ?? null });
    if (error) return { resumed, started }; // 281 sin aplicar
    const settingsCache = new Map<string, OrgFlowSettings | null>();
    const settingsFor = async (orgId: string) => {
      if (!settingsCache.has(orgId)) settingsCache.set(orgId, await loadOrgFlowSettings(admin, orgId));
      return settingsCache.get(orgId) ?? null;
    };
    for (const run of (due ?? []) as RunRow[]) {
      const settings = await settingsFor(run.organization_id);
      const { data: convRaw } = await admin.from("wa_conversations").select(CONV_COLS).eq("id", run.conversation_id).maybeSingle();
      if (!settings || !convRaw) continue;
      const conv = convRaw as unknown as ConvRow;
      if (conv.bot_opted_out || (conv.bot_paused_until && new Date(conv.bot_paused_until).getTime() > Date.now())) {
        await admin.from("wa_flow_runs").update({ status: "handed_off", ended_at: new Date().toISOString(), end_reason: "persona", wake_at: null, claimed_at: null }).eq("id", run.id);
        continue;
      }
      const def = await loadDefinition(admin, run);
      if (!def) {
        await persistRun(admin, run, { status: "failed", currentNodeId: run.current_node_id, context: run.context, steps: run.steps, wakeAt: null, endReason: "definicion_perdida" }, null, null);
        continue;
      }
      await runStep(admin, settings, conv, run, def, { type: "timer" });
      resumed++;
    }

    // Disparador "sin respuesta del equipo".
    let q = admin.from("wa_flows").select("id, name, status, priority, trigger, definition, published_version_id, organization_id").eq("status", "active").filter("trigger->>kind", "eq", "no_reply").limit(100);
    if (opts.orgId) q = q.eq("organization_id", opts.orgId);
    const { data: noReplyFlows } = await q;
    for (const f of (noReplyFlows ?? []) as Array<FlowRow & { organization_id: string }>) {
      const settings = await settingsFor(f.organization_id);
      if (!settings || !settings.flows_enabled) continue;
      const trigger = TriggerSchema.safeParse(f.trigger);
      if (!trigger.success) continue;
      const t = trigger.data;
      const now = new Date();
      if (t.only_business_hours && !isBusinessHoursOpen(settings.sched, settings.timezone, now)) continue;
      const upper = new Date(now.getTime() - t.minutes * 60_000).toISOString();
      const lower = new Date(now.getTime() - (t.minutes + 24 * 60) * 60_000).toISOString();
      const { data: convs } = await admin
        .from("wa_conversations")
        .select(CONV_COLS)
        .eq("organization_id", f.organization_id)
        .eq("inbox_status", "open")
        .eq("last_message_dir", "in")
        .eq("bot_opted_out", false)
        .lte("last_inbound_at", upper)
        .gte("last_inbound_at", lower)
        .order("last_inbound_at", { ascending: false })
        .limit(20);
      for (const c of (convs ?? []) as unknown as ConvRow[]) {
        if (c.bot_paused_until && new Date(c.bot_paused_until).getTime() > Date.now()) continue;
        if (await startRun(admin, settings, c, f, t, { type: "start" })) started++;
      }
    }
  } catch (err) {
    console.error("[Flows] tick:", err);
  }
  return { resumed, started };
}
