import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const schema = z.object({
  suggestion_id: z.string().uuid(),
  /** 1 = pulgar arriba, -1 = pulgar abajo, null = quitar la valoración. */
  rating: z.union([z.literal(1), z.literal(-1)]).nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * POST /api/inbox/ai/feedback — pulgar arriba / abajo sobre una sugerencia
 * de Yendy (mig 278). Cualquier miembro con acceso a la bandeja puede
 * valorar; el registro lo lee solo administración (RLS de wa_ai_suggestions).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;

  const { data, error } = await ctx.admin
    .from("wa_ai_suggestions")
    .update({
      rating: b.rating,
      rating_note: b.rating === null ? null : (b.note?.trim() || null),
      rated_by: b.rating === null ? null : ctx.userId,
      rated_at: b.rating === null ? null : new Date().toISOString(),
    })
    .eq("id", b.suggestion_id)
    .eq("organization_id", ctx.orgId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "42703") {
      return NextResponse.json({ error: "Falta aplicar la migración 278 (pulgar arriba/abajo)", code: "migration_278" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar la valoración" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
