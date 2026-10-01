import { NextRequest, NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { validateFlow } from "@/lib/inbox/flows/validate";

export const runtime = "nodejs";

/**
 * POST /api/inbox/flows/:id/publish — valida el borrador contra la org
 * (etiquetas, plantillas aprobadas y miembros propios), crea una versión
 * inmutable y activa el flow. Los runs en curso siguen con su versión.
 * Solo admin.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  const { id } = await params;
  const { data: flow } = await ctx.admin.from("wa_flows").select("id, name, status, version, trigger, definition").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!flow) return NextResponse.json({ error: "Flow no encontrado" }, { status: 404 });

  const [{ data: tags }, { data: templates }, { data: members }] = await Promise.all([
    ctx.admin.from("org_tags").select("id").eq("organization_id", ctx.orgId),
    ctx.admin.from("whatsapp_templates").select("id").eq("organization_id", ctx.orgId).eq("status", "APPROVED"),
    ctx.admin.from("organization_members").select("user_id").eq("organization_id", ctx.orgId).eq("is_active", true),
  ]);
  const v = validateFlow(flow.trigger, flow.definition, {
    tagIds: new Set((tags ?? []).map((t) => t.id as string)),
    templateIds: new Set((templates ?? []).map((t) => t.id as string)),
    userIds: new Set((members ?? []).map((m) => m.user_id as string)),
  });
  if (!v.ok || !v.trigger || !v.definition) {
    return NextResponse.json({ error: "El flow tiene errores; corrígelos antes de publicar.", issues: v.issues }, { status: 422 });
  }
  // Dos flows activos con la misma palabra clave: aviso (el de menor prioridad gana).
  if (v.trigger.kind === "keyword") {
    const { data: others } = await ctx.admin.from("wa_flows").select("id, name, trigger").eq("organization_id", ctx.orgId).eq("status", "active").neq("id", id);
    const mine = new Set(v.trigger.keywords.map((k) => k.toLowerCase()));
    for (const o of (others ?? []) as Array<{ id: string; name: string; trigger: { kind?: string; keywords?: string[] } }>) {
      if (o.trigger?.kind === "keyword" && (o.trigger.keywords ?? []).some((k) => mine.has(k.toLowerCase()))) {
        v.issues.push({ level: "warning", message: `“${o.name}” también se dispara con alguna de estas palabras; gana el de menor prioridad.` });
      }
    }
  }
  const nextVersion = ((flow.version as number) ?? 0) + 1;
  const { data: version, error: vErr } = await ctx.admin
    .from("wa_flow_versions")
    .insert({ organization_id: ctx.orgId, flow_id: id, version: nextVersion, trigger: v.trigger, definition: v.definition, published_by: ctx.userId })
    .select("id, version, published_at")
    .single();
  if (vErr || !version) return NextResponse.json({ error: "No se pudo crear la versión" }, { status: 500 });
  const { error: fErr } = await ctx.admin
    .from("wa_flows")
    .update({ status: "active", version: nextVersion, published_version_id: version.id, trigger: v.trigger, definition: v.definition, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id);
  if (fErr) return NextResponse.json({ error: "La versión se creó pero no se pudo activar el flow" }, { status: 500 });
  return NextResponse.json({ ok: true, version, issues: v.issues });
}
