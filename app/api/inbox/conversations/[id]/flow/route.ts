import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { startFlowManually } from "@/lib/inbox/flows/runtime";

export const runtime = "nodejs";

const schema = z.object({ flow_id: z.string().uuid() });

/** POST /api/inbox/conversations/:id/flow — "Iniciar flow" a mano (disparador manual o prueba real). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const res = await startFlowManually(ctx.admin, ctx.orgId, id, parsed.data.flow_id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
