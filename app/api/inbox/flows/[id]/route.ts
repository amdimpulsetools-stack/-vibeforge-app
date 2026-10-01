import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { DefinitionSchema, TriggerSchema } from "@/lib/inbox/flows/schema";

export const runtime = "nodejs";

const FLOW_COLS = "id, name, status, priority, trigger, definition, version, published_version_id, created_at, updated_at";

/** GET /api/inbox/flows/:id — el flow (borrador) y sus versiones publicadas. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { id } = await params;
  const { data: flow } = await ctx.admin.from("wa_flows").select(FLOW_COLS).eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!flow) return NextResponse.json({ error: "Flow no encontrado" }, { status: 404 });
  const { data: versions } = await ctx.admin.from("wa_flow_versions").select("id, version, published_at, published_by").eq("flow_id", id).order("version", { ascending: false }).limit(20);
  return NextResponse.json({ flow, versions: versions ?? [] });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  priority: z.number().int().min(1).max(999).optional(),
  trigger: z.unknown().optional(),
  definition: z.unknown().optional(),
  /** paused ↔ active (solo con versión publicada); archived = borrar. */
  status: z.enum(["active", "paused", "archived"]).optional(),
});

/** PATCH /api/inbox/flows/:id — guardar borrador, renombrar, pausar / reanudar / archivar. Solo admin. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;
  const { data: flow } = await ctx.admin.from("wa_flows").select("id, status, version").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!flow) return NextResponse.json({ error: "Flow no encontrado" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.userId };
  if (b.name) patch.name = b.name;
  if (b.priority) patch.priority = b.priority;
  if (b.trigger !== undefined) {
    // El borrador se guarda aunque esté incompleto; la forma estricta se exige al publicar.
    const t = TriggerSchema.safeParse(b.trigger);
    patch.trigger = t.success ? t.data : b.trigger;
  }
  if (b.definition !== undefined) {
    if (!b.definition || typeof b.definition !== "object" || JSON.stringify(b.definition).length > 250_000) {
      return NextResponse.json({ error: "Definición inválida o demasiado grande" }, { status: 400 });
    }
    const d = DefinitionSchema.safeParse(b.definition);
    patch.definition = d.success ? d.data : b.definition;
  }
  if (b.status) {
    if (b.status === "active" && (flow.version as number) === 0) {
      return NextResponse.json({ error: "Publica el flow antes de activarlo" }, { status: 409 });
    }
    patch.status = b.status;
  }
  const { data, error } = await ctx.admin.from("wa_flows").update(patch).eq("id", id).select(FLOW_COLS).single();
  if (error || !data) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  if (b.status === "archived" || b.status === "paused") {
    // Los runs en curso de un flow pausado o archivado terminan (nadie se queda esperando a un bot apagado).
    await ctx.admin
      .from("wa_flow_runs")
      .update({ status: "done", ended_at: new Date().toISOString(), end_reason: b.status === "archived" ? "flow_archivado" : "flow_pausado", wake_at: null, claimed_at: null })
      .eq("flow_id", id)
      .in("status", ["running", "waiting_reply", "waiting_delay"]);
  }
  return NextResponse.json({ flow: data });
}

/** DELETE /api/inbox/flows/:id — archiva (no borra: las ejecuciones quedan). */
export async function DELETE(req: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const proxied = new NextRequest(url, { method: "PATCH", headers: req.headers, body: JSON.stringify({ status: "archived" }) });
  return PATCH(proxied, ctxParams);
}
