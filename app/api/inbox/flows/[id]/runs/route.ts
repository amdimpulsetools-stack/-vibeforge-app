import { NextRequest, NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

/** GET /api/inbox/flows/:id/runs — últimas ejecuciones y contador por nodo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { id } = await params;
  const { data: runs, error } = await ctx.admin
    .from("wa_flow_runs")
    .select("id, conversation_id, status, trigger_kind, current_node_id, steps, started_at, ended_at, end_reason")
    .eq("organization_id", ctx.orgId)
    .eq("flow_id", id)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "No se pudieron leer las ejecuciones" }, { status: 500 });
  const runIds = (runs ?? []).map((r) => r.id as string);
  const nodeCounts: Record<string, number> = {};
  if (runIds.length) {
    const { data: events } = await ctx.admin.from("wa_flow_run_events").select("node_id").eq("kind", "node").in("run_id", runIds).limit(5000);
    for (const e of (events ?? []) as Array<{ node_id: string | null }>) {
      if (e.node_id) nodeCounts[e.node_id] = (nodeCounts[e.node_id] ?? 0) + 1;
    }
  }
  return NextResponse.json({ runs: runs ?? [], node_counts: nodeCounts });
}
