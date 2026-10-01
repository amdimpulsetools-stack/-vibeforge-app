import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { FLOW_TEMPLATES } from "@/lib/inbox/flows/templates";

export const runtime = "nodejs";

const FLOW_COLS = "id, name, status, priority, trigger, version, published_version_id, created_at, updated_at";

/** GET /api/inbox/flows — lista de flows de la org (todos los que ven la bandeja). */
export async function GET(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { data, error } = await ctx.admin.from("wa_flows").select(FLOW_COLS).eq("organization_id", ctx.orgId).neq("status", "archived").order("priority").order("updated_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ error: "Falta aplicar la migración 281", code: "migration_281" }, { status: 409 });
    return NextResponse.json({ error: "No se pudieron leer los flows" }, { status: 500 });
  }
  const ids = (data ?? []).map((f) => f.id as string);
  const counts = new Map<string, { runs: number; active: number }>();
  if (ids.length) {
    const { data: runs } = await ctx.admin.from("wa_flow_runs").select("flow_id, status").eq("organization_id", ctx.orgId).in("flow_id", ids).limit(5000);
    for (const r of (runs ?? []) as Array<{ flow_id: string; status: string }>) {
      const c = counts.get(r.flow_id) ?? { runs: 0, active: 0 };
      c.runs += 1;
      if (["running", "waiting_reply", "waiting_delay"].includes(r.status)) c.active += 1;
      counts.set(r.flow_id, c);
    }
  }
  return NextResponse.json({
    flows: (data ?? []).map((f) => ({ ...f, runs: counts.get(f.id as string)?.runs ?? 0, active_runs: counts.get(f.id as string)?.active ?? 0 })),
    templates: FLOW_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  template: z.enum(["welcome", "no_reply", "confirm"]).optional(),
});

/** POST /api/inbox/flows — crea un borrador (vacío o desde plantilla). Solo admin. */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const tpl = parsed.data.template ? FLOW_TEMPLATES.find((t) => t.key === parsed.data.template) : null;
  const { count } = await ctx.admin.from("wa_flows").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).neq("status", "archived");
  if ((count ?? 0) >= 30) return NextResponse.json({ error: "Máximo 30 flows por clínica (archiva alguno)" }, { status: 409 });
  const row = {
    organization_id: ctx.orgId,
    name: parsed.data.name ?? tpl?.name ?? "Nuevo flow",
    status: "draft",
    trigger: tpl?.trigger ?? { kind: "keyword", keywords: [], match: "contains", silence_days: 30, minutes: 30, only_business_hours: true, payloads: [], cooldown_hours: 4 },
    definition: tpl?.definition ?? {
      nodes: [
        { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
        { id: "h", type: "handoff", position: { x: 0, y: 160 }, data: { note: "" } },
      ],
      edges: [{ id: "e1", source: "t", sourceHandle: "next", target: "h" }],
    },
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };
  const { data, error } = await ctx.admin.from("wa_flows").insert(row).select(FLOW_COLS + ", definition").single();
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ error: "Falta aplicar la migración 281", code: "migration_281" }, { status: 409 });
    return NextResponse.json({ error: "No se pudo crear el flow" }, { status: 500 });
  }
  return NextResponse.json({ flow: data });
}
