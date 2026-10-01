import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { validateFlow } from "@/lib/inbox/flows/validate";
import { initialState, step, type Env, type RunState } from "@/lib/inbox/flows/engine";
import { DEFAULT_DISCLOSURE } from "@/lib/inbox/flows/runtime";

export const runtime = "nodejs";

const schema = z.object({
  /** Borrador sin guardar (opcional): si no viene, se usa el guardado. */
  trigger: z.unknown().optional(),
  definition: z.unknown().optional(),
  events: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("start") }),
        z.object({ type: z.literal("inbound"), text: z.string().max(4096).nullable(), interactiveId: z.string().max(256).nullable().optional() }),
        z.object({ type: z.literal("timer") }),
      ]),
    )
    .min(1)
    .max(40),
  env: z
    .object({
      windowOpen: z.boolean().optional(),
      businessHoursOpen: z.boolean().optional(),
      hasPatient: z.boolean().optional(),
      patientFirstName: z.string().max(60).nullable().optional(),
      quiet: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/inbox/flows/:id/test — simula el flow con el motor puro: no
 * envía nada ni escribe en la base. Devuelve, por evento, los efectos
 * (lo que diría el bot) y el rastro de nodos.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;
  let trigger = b.trigger;
  let definition = b.definition;
  if (trigger === undefined || definition === undefined) {
    const { data: flow } = await ctx.admin.from("wa_flows").select("trigger, definition").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
    if (!flow) return NextResponse.json({ error: "Flow no encontrado" }, { status: 404 });
    trigger ??= flow.trigger;
    definition ??= flow.definition;
  }
  const v = validateFlow(trigger, definition);
  if (!v.definition) return NextResponse.json({ error: "El flow tiene errores", issues: v.issues }, { status: 422 });

  const { data: org } = await ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle();
  const { data: settings } = await ctx.admin.from("wa_inbox_settings").select("flows_disclosure").eq("organization_id", ctx.orgId).maybeSingle();
  const clinicName = (org?.name as string | undefined) ?? "la clínica";
  const disclosureRaw = ((settings?.flows_disclosure as string | null | undefined) ?? DEFAULT_DISCLOSURE).replace(/\{\{\s*clinica\s*\}\}/gi, clinicName);
  let now = new Date();
  const env = (): Env => ({
    now,
    windowOpen: b.env?.windowOpen ?? true,
    businessHoursOpen: b.env?.businessHoursOpen ?? true,
    hasPatient: b.env?.hasPatient ?? false,
    tagIds: [],
    patientFirstName: b.env?.patientFirstName === undefined ? "Ana" : b.env.patientFirstName,
    clinicName,
    disclosure: disclosureRaw.trim() || null,
    quietUntil: b.env?.quiet ? new Date(now.getTime() + 3600_000) : null,
  });

  let state: RunState = initialState();
  const out = [];
  for (const ev of b.events) {
    if (ev.type === "timer") now = new Date((state.wakeAt ? new Date(state.wakeAt).getTime() : now.getTime()) + 1000);
    const r = step(v.definition, state, ev.type === "inbound" ? { type: "inbound", text: ev.text, interactiveId: ev.interactiveId ?? null } : ev, env());
    state = r.state;
    out.push({ event: ev, effects: r.effects, trace: r.trace, status: state.status, endReason: state.endReason, wakeAt: state.wakeAt, currentNodeId: state.currentNodeId });
    if (state.status === "done" || state.status === "handed_off" || state.status === "failed") break;
  }
  return NextResponse.json({ steps: out, issues: v.issues });
}
