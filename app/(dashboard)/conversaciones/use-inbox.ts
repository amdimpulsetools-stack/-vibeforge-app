"use client";

/**
 * Datos de Conversaciones (mig 275). Lecturas directas con el cliente del
 * navegador (RLS decide qué ve cada rol); escrituras por /api/inbox/*.
 *
 * Tiempo real = sondeo POR DIFERENCIAS, solo en esta pantalla y con la
 * pestaña visible:
 *   · lista: primera página de 100 (+ "cargar más" por cursor); cada 5 s
 *     se piden SOLO las conversaciones con updated_at posterior a la
 *     última vista (índice de la mig 277) y se mezclan en caché; cada
 *     60 s un refresco completo como red de seguridad (etiquetas puestas
 *     por otro usuario no tocan updated_at);
 *   · chat: últimos 50 (+ "anteriores" por cursor); cada 3 s solo los
 *     mensajes nuevos (ts > último) y el estado de los últimos salientes
 *     aún no leídos.
 * Antes bajaba 300 conversaciones (~120 KB) cada 8 s aunque nada cambiara.
 * Nada de esto corre en la agenda ni en otras páginas. Si una lectura
 * falla, se LANZA (CLAUDE.md: nunca convertir un error en lista vacía) y
 * la pantalla muestra el aviso; un fallo del delta solo se registra y el
 * refresco completo lo cubre.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { PostgrestLoadError } from "../scheduler/data-load-error";
import {
  INBOX_CONVERSATION_COLUMNS,
  INBOX_MESSAGE_COLUMNS,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/inbox/shared";

export interface ConversationRow extends InboxConversation {
  patients: { first_name: string | null; last_name: string | null; phone: string | null; dni: string | null; email: string | null } | null;
  wa_conversation_tags: Array<{ tag_id: string }>;
}

export interface OrgTag {
  id: string;
  name: string;
  color: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export interface ScheduledRow {
  id: string;
  kind: "text" | "template";
  body: string | null;
  template_id: string | null;
  send_at: string;
  status: string;
  last_error: string | null;
}

export interface InboxSettingsRow {
  doctors_enabled: boolean;
  ai_enabled: boolean;
  ai_model: "claude-haiku-4-5" | "claude-sonnet-5-5";
  ai_tone: "calido" | "formal";
  ai_use_emojis: boolean;
  ai_signature: string | null;
  ai_rules: string | null;
  ai_hidden_service_ids: string[];
  /** Guía de conversación (mig 276). {} = fórmula sugerida. */
  ai_playbook: Record<string, unknown>;
}

export interface ApprovedTemplate {
  id: string;
  meta_template_name: string;
  language: string;
  category: string;
  body_text: string;
  variable_mapping: Record<string, string>;
}

export const inboxKeys = {
  conversations: (org: string | null) => ["inbox", "conversations", org] as const,
  messages: (conv: string | null) => ["inbox", "messages", conv] as const,
  tags: (org: string | null) => ["inbox", "tags", org] as const,
  quickReplies: (org: string | null) => ["inbox", "quick-replies", org] as const,
  scheduled: (conv: string | null) => ["inbox", "scheduled", conv] as const,
  settings: (org: string | null) => ["inbox", "settings", org] as const,
  templates: (org: string | null) => ["inbox", "templates", org] as const,
  kb: (org: string | null) => ["inbox", "kb", org] as const,
  cases: (org: string | null) => ["inbox", "kb-cases", org] as const,
  services: (org: string | null) => ["inbox", "services", org] as const,
  gaps: (org: string | null) => ["inbox", "gaps", org] as const,
};

const LIST_PAGE = 100;
const LIST_DELTA_MS = 5_000;
const LIST_FULL_MS = 60_000;
const MSG_PAGE = 50;
const MSG_DELTA_MS = 3_000;
const MSG_FULL_MS = 60_000;
const CONV_SELECT = `${INBOX_CONVERSATION_COLUMNS}, patients(first_name, last_name, phone, dni, email), wa_conversation_tags(tag_id)`;
const OPEN_STATUSES = ["sending", "sent", "delivered", "unknown"];

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}
/** Un segundo de solape: dos filas con el mismo instante no se pierden; el id desduplica. */
function overlap(iso: string): string {
  return new Date(new Date(iso).getTime() - 1000).toISOString();
}
function mergeConversations(prev: ConversationRow[] | undefined, incoming: ConversationRow[]): ConversationRow[] {
  const map = new Map((prev ?? []).map((c) => [c.id, c]));
  for (const c of incoming) map.set(c.id, c);
  return [...map.values()].sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : a.last_message_at > b.last_message_at ? -1 : 0));
}
function mergeMessages(prev: InboxMessage[] | undefined, incoming: InboxMessage[]): InboxMessage[] {
  const map = new Map((prev ?? []).map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : 1));
}

export function useConversations(orgId: string | null) {
  const qc = useQueryClient();
  const key = inboxKeys.conversations(orgId);
  // Cuántas filas tiene cargadas la pantalla (crece con "cargar más");
  // el refresco completo las vuelve a pedir todas para no perder páginas.
  const loadedRef = useRef(LIST_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    refetchInterval: LIST_FULL_MS,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_conversations")
        .select(CONV_SELECT)
        .eq("organization_id", orgId as string)
        .order("last_message_at", { ascending: false })
        .limit(Math.max(LIST_PAGE, loadedRef.current));
      if (error) throw new PostgrestLoadError("Conversaciones", error);
      const rows = (data ?? []) as unknown as ConversationRow[];
      if (rows.length < LIST_PAGE) setHasMore(false);
      return rows;
    },
  });

  // Delta: solo lo que cambió desde la última fila vista.
  useEffect(() => {
    if (!orgId) return;
    let busy = false;
    const tick = async () => {
      if (busy || !visible()) return;
      const current = qc.getQueryData<ConversationRow[]>(key);
      if (!current || current.length === 0) return; // la consulta completa se encarga
      busy = true;
      try {
        const since = current.reduce((max, c) => (c.updated_at > max ? c.updated_at : max), current[0].updated_at);
        const { data, error } = await createClient()
          .from("wa_conversations")
          .select(CONV_SELECT)
          .eq("organization_id", orgId)
          .gt("updated_at", overlap(since))
          .order("updated_at", { ascending: false })
          .limit(200);
        if (error) {
          console.warn("[Conversaciones] delta falló; el refresco completo lo cubre:", error.message);
          return;
        }
        const rows = (data ?? []) as unknown as ConversationRow[];
        // Siempre vuelve al menos la propia fila "since" (solape): solo
        // tocamos la caché si hay algo realmente distinto.
        const changed = rows.filter((r) => {
          const p = current.find((c) => c.id === r.id);
          return !p || p.updated_at !== r.updated_at;
        });
        if (changed.length > 0) qc.setQueryData<ConversationRow[]>(key, (prev) => mergeConversations(prev, changed));
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void tick(), LIST_DELTA_MS);
    return () => clearInterval(id);
  }, [orgId, qc, key]);

  const loadMore = useCallback(async () => {
    const current = qc.getQueryData<ConversationRow[]>(key);
    if (!orgId || !current || current.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = current[current.length - 1].last_message_at;
      const { data, error } = await createClient()
        .from("wa_conversations")
        .select(CONV_SELECT)
        .eq("organization_id", orgId)
        .lt("last_message_at", oldest)
        .order("last_message_at", { ascending: false })
        .limit(LIST_PAGE);
      if (error) throw new PostgrestLoadError("Conversaciones (más)", error);
      const rows = (data ?? []) as unknown as ConversationRow[];
      if (rows.length < LIST_PAGE) setHasMore(false);
      loadedRef.current = current.length + rows.length;
      qc.setQueryData<ConversationRow[]>(key, (prev) => mergeConversations(prev, rows));
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, qc, key, loadingMore]);

  /** Cambio local (p. ej. marcar leído) sin volver a pedir la lista. */
  const patchLocal = useCallback(
    (id: string, patch: Partial<ConversationRow>) => {
      qc.setQueryData<ConversationRow[]>(key, (prev) => prev?.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [qc, key],
  );

  return { ...query, loadMore, hasMore, loadingMore, patchLocal };
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const key = inboxKeys.messages(conversationId);
  const loadedRef = useRef(MSG_PAGE);
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    loadedRef.current = MSG_PAGE;
    setHasOlder(true);
  }, [conversationId]);

  const query = useQuery({
    queryKey: key,
    enabled: !!conversationId,
    refetchInterval: MSG_FULL_MS,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_messages")
        .select(INBOX_MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId as string)
        .order("ts", { ascending: false })
        .order("id", { ascending: false })
        .limit(Math.max(MSG_PAGE, loadedRef.current));
      if (error) throw new PostgrestLoadError("Mensajes", error);
      const rows = ((data ?? []) as unknown as InboxMessage[]).reverse();
      if (rows.length < MSG_PAGE) setHasOlder(false);
      return rows;
    },
  });

  // Delta: mensajes nuevos + estado de los últimos salientes aún "en vuelo".
  useEffect(() => {
    if (!conversationId) return;
    let busy = false;
    const tick = async () => {
      if (busy || !visible()) return;
      const current = qc.getQueryData<InboxMessage[]>(key);
      if (!current) return;
      busy = true;
      try {
        const supabase = createClient();
        const last = current[current.length - 1]?.ts;
        const pendingOut = current.some((m) => m.direction === "out" && OPEN_STATUSES.includes(m.status));
        const [fresh, statuses] = await Promise.all([
          last
            ? supabase
                .from("wa_messages")
                .select(INBOX_MESSAGE_COLUMNS)
                .eq("conversation_id", conversationId)
                .gt("ts", overlap(last))
                .order("ts", { ascending: true })
                .limit(100)
            : supabase.from("wa_messages").select(INBOX_MESSAGE_COLUMNS).eq("conversation_id", conversationId).order("ts", { ascending: false }).limit(MSG_PAGE),
          pendingOut
            ? supabase
                .from("wa_messages")
                .select("id, status, error_title")
                .eq("conversation_id", conversationId)
                .eq("direction", "out")
                .order("ts", { ascending: false })
                .limit(20)
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (fresh.error || statuses.error) {
          console.warn("[Conversaciones] delta de mensajes falló; el refresco completo lo cubre:", (fresh.error ?? statuses.error)?.message);
          return;
        }
        const incoming = (fresh.data ?? []) as unknown as InboxMessage[];
        const statusMap = new Map(((statuses.data ?? []) as Array<{ id: string; status: InboxMessage["status"]; error_title: string | null }>).map((r) => [r.id, r]));
        const changed =
          incoming.some((m) => !current.find((c) => c.id === m.id)) ||
          current.some((m) => {
            const s = statusMap.get(m.id);
            return s && (s.status !== m.status || s.error_title !== m.error_title);
          });
        if (!changed) return;
        qc.setQueryData<InboxMessage[]>(key, (prev) => {
          const merged = mergeMessages(prev, incoming);
          return merged.map((m) => {
            const s = statusMap.get(m.id);
            return s && (s.status !== m.status || s.error_title !== m.error_title) ? { ...m, status: s.status, error_title: s.error_title } : m;
          });
        });
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void tick(), MSG_DELTA_MS);
    return () => clearInterval(id);
  }, [conversationId, qc, key]);

  const loadOlder = useCallback(async () => {
    const current = qc.getQueryData<InboxMessage[]>(key);
    if (!conversationId || !current || current.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = current[0].ts;
      const { data, error } = await createClient()
        .from("wa_messages")
        .select(INBOX_MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .lt("ts", oldest)
        .order("ts", { ascending: false })
        .order("id", { ascending: false })
        .limit(MSG_PAGE);
      if (error) throw new PostgrestLoadError("Mensajes anteriores", error);
      const rows = (data ?? []) as unknown as InboxMessage[];
      if (rows.length < MSG_PAGE) setHasOlder(false);
      loadedRef.current = current.length + rows.length;
      qc.setQueryData<InboxMessage[]>(key, (prev) => mergeMessages(prev, rows));
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, qc, key, loadingOlder]);

  return { ...query, loadOlder, hasOlder, loadingOlder };
}

/** Servicios activos de la org (catálogo), para fichas y casos por servicio. */
export function useOrgServices(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.services(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("services")
        .select("id, name")
        .eq("organization_id", orgId as string)
        .eq("is_active", true)
        .order("name");
      if (error) throw new PostgrestLoadError("Servicios", error);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
}

export function useOrgTags(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.tags(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("org_tags")
        .select("id, name, color")
        .eq("organization_id", orgId as string)
        .order("name");
      if (error) throw new PostgrestLoadError("Etiquetas", error);
      return (data ?? []) as OrgTag[];
    },
  });
}

export function useQuickReplies(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.quickReplies(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_quick_replies")
        .select("id, shortcut, title, body")
        .eq("organization_id", orgId as string)
        .order("shortcut");
      if (error) throw new PostgrestLoadError("Respuestas rápidas", error);
      return (data ?? []) as QuickReply[];
    },
  });
}

export function useScheduled(conversationId: string | null) {
  return useQuery({
    queryKey: inboxKeys.scheduled(conversationId),
    enabled: !!conversationId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_scheduled_messages")
        .select("id, kind, body, template_id, send_at, status, last_error")
        .eq("conversation_id", conversationId as string)
        .in("status", ["pending", "sending", "needs_template", "failed"])
        .order("send_at");
      if (error) throw new PostgrestLoadError("Programados", error);
      return (data ?? []) as ScheduledRow[];
    },
  });
}

export const DEFAULT_SETTINGS: InboxSettingsRow = {
  doctors_enabled: false,
  ai_enabled: true,
  ai_model: "claude-haiku-4-5",
  ai_tone: "calido",
  ai_use_emojis: true,
  ai_signature: null,
  ai_rules: null,
  ai_hidden_service_ids: [],
  ai_playbook: {},
};

export function useInboxSettings(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.settings(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_inbox_settings")
        .select("doctors_enabled, ai_enabled, ai_model, ai_tone, ai_use_emojis, ai_signature, ai_rules, ai_hidden_service_ids, ai_playbook")
        .eq("organization_id", orgId as string)
        .maybeSingle();
      if (error) throw new PostgrestLoadError("Ajustes de Conversaciones", error);
      return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as InboxSettingsRow;
    },
  });
}

export function useApprovedTemplates(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.templates(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(inboxUrl("/api/inbox/templates"));
      if (!res.ok) return [] as ApprovedTemplate[];
      const json = (await res.json()) as { templates: ApprovedTemplate[] };
      return json.templates ?? [];
    },
  });
}

/**
 * Org que el usuario tiene abierta. Toda llamada a /api/inbox/* la manda
 * (?org=) y el servidor exige membresía activa en ella: con dos clínicas
 * la API no debe adivinar cuál.
 */
let inboxOrgId: string | null = null;
export function setInboxOrg(orgId: string | null) {
  inboxOrgId = orgId;
}
export function inboxUrl(url: string): string {
  if (!inboxOrgId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}org=${encodeURIComponent(inboxOrgId)}`;
}

/** POST/PATCH/DELETE a /api/inbox/* con el error legible de la API. */
export async function inboxFetch<T = unknown>(
  url: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  try {
    const res = await fetch(inboxUrl(url), {
      method: init.method,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "Error inesperado", code: json.code };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, error: "Sin conexión. Intenta de nuevo." };
  }
}
