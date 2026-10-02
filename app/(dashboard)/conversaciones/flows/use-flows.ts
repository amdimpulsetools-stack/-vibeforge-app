"use client";

import { useQuery } from "@tanstack/react-query";
import { inboxFetch } from "../use-inbox";
import type { Trigger, FlowDefinition, FlowStatus } from "@/lib/inbox/flows/schema";

export interface FlowListItem {
  id: string;
  name: string;
  status: FlowStatus;
  priority: number;
  trigger: Partial<Trigger>;
  version: number;
  published_version_id: string | null;
  updated_at: string;
  runs: number;
  active_runs: number;
}
export interface FlowDetail extends Omit<FlowListItem, "runs" | "active_runs"> {
  definition: FlowDefinition;
}
export interface FlowTemplateInfo {
  key: "welcome" | "no_reply" | "confirm";
  name: string;
  description: string;
}

export const flowKeys = {
  list: (org: string | null) => ["inbox", "flows", org] as const,
  one: (id: string | null) => ["inbox", "flow", id] as const,
  runs: (id: string | null) => ["inbox", "flow-runs", id] as const,
  members: (org: string | null) => ["inbox", "members", org] as const,
};

class FlowsError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export function useFlows(orgId: string | null) {
  return useQuery({
    queryKey: flowKeys.list(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const res = await inboxFetch<{ flows: FlowListItem[]; templates: FlowTemplateInfo[] }>("/api/inbox/flows", { method: "GET" });
      if (!res.ok) throw new FlowsError(res.error, res.code);
      return res.data;
    },
  });
}

export function useFlow(id: string | null) {
  return useQuery({
    queryKey: flowKeys.one(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await inboxFetch<{ flow: FlowDetail; versions: Array<{ id: string; version: number; published_at: string }> }>(`/api/inbox/flows/${id}`, { method: "GET" });
      if (!res.ok) throw new FlowsError(res.error, res.code);
      return res.data;
    },
  });
}

export interface FlowRun {
  id: string;
  conversation_id: string;
  status: string;
  trigger_kind: string | null;
  current_node_id: string | null;
  steps: number;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
}
export function useFlowRuns(id: string | null) {
  return useQuery({
    queryKey: flowKeys.runs(id),
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await inboxFetch<{ runs: FlowRun[]; node_counts: Record<string, number> }>(`/api/inbox/flows/${id}/runs`, { method: "GET" });
      if (!res.ok) throw new FlowsError(res.error, res.code);
      return res.data;
    },
  });
}

export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: flowKeys.members(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await inboxFetch<{ members: Array<{ user_id: string; role: string; full_name: string }> }>("/api/inbox/members", { method: "GET" });
      if (!res.ok) throw new FlowsError(res.error, res.code);
      return res.data.members;
    },
  });
}
