"use client";

/**
 * Datos de Conversaciones (mig 275). Lecturas directas con el cliente del
 * navegador (RLS decide qué ve cada rol); escrituras por /api/inbox/*.
 *
 * Tiempo real del MVP = sondeo liviano SOLO en esta pantalla y con la
 * pestaña visible (React Query pausa el intervalo en segundo plano):
 * lista cada 8 s, chat abierto cada 4 s. Nada de esto corre en la agenda
 * ni en otras páginas. Si una lectura falla, se LANZA (CLAUDE.md: nunca
 * convertir un error en lista vacía) y la pantalla muestra el aviso.
 */

import { useQuery } from "@tanstack/react-query";
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
  gaps: (org: string | null) => ["inbox", "gaps", org] as const,
};

export function useConversations(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.conversations(orgId),
    enabled: !!orgId,
    refetchInterval: 8_000,
    retry: 1,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wa_conversations")
        .select(
          `${INBOX_CONVERSATION_COLUMNS}, patients(first_name, last_name, phone, dni, email), wa_conversation_tags(tag_id)`,
        )
        .eq("organization_id", orgId as string)
        .order("last_message_at", { ascending: false })
        .limit(300);
      if (error) throw new PostgrestLoadError("Conversaciones", error);
      return (data ?? []) as unknown as ConversationRow[];
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: inboxKeys.messages(conversationId),
    enabled: !!conversationId,
    refetchInterval: 4_000,
    retry: 1,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wa_messages")
        .select(INBOX_MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId as string)
        .order("ts", { ascending: false })
        .limit(150);
      if (error) throw new PostgrestLoadError("Mensajes", error);
      return ((data ?? []) as unknown as InboxMessage[]).reverse();
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
};

export function useInboxSettings(orgId: string | null) {
  return useQuery({
    queryKey: inboxKeys.settings(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_inbox_settings")
        .select("doctors_enabled, ai_enabled, ai_model, ai_tone, ai_use_emojis, ai_signature")
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
      const res = await fetch("/api/inbox/templates");
      if (!res.ok) return [] as ApprovedTemplate[];
      const json = (await res.json()) as { templates: ApprovedTemplate[] };
      return json.templates ?? [];
    },
  });
}

/** POST/PATCH/DELETE a /api/inbox/* con el error legible de la API. */
export async function inboxFetch<T = unknown>(
  url: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  try {
    const res = await fetch(url, {
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
