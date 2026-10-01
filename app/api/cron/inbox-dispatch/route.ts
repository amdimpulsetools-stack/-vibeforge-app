import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchDueScheduled } from "@/lib/inbox/dispatch";

export const runtime = "nodejs";

/**
 * GET /api/cron/inbox-dispatch — envía los mensajes programados vencidos
 * de todas las orgs (Conversaciones, mig 275). Pensado para pg_cron +
 * pg_net cada minuto (Vercel Hobby no corre crons por minuto); la
 * pantalla de Conversaciones además dispara /api/inbox/dispatch para su
 * propia org mientras está abierta. Idempotente: la toma es atómica.
 * Auth: Authorization: Bearer $CRON_SECRET (≥ 32 caracteres).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${cronSecret ?? ""}`);
  if (!cronSecret || cronSecret.length < 32 || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await dispatchDueScheduled(createAdminClient(), { limit: 50 });
  return NextResponse.json(result);
}

export const POST = GET;
