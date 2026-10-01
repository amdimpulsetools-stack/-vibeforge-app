import { NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { dispatchDueScheduled } from "@/lib/inbox/dispatch";

export const runtime = "nodejs";

/** POST /api/inbox/dispatch — programados vencidos de la PROPIA org
 *  (respaldo mientras la pantalla está abierta; ver cron/inbox-dispatch). */
export async function POST() {
  const ctx = await requireInbox();
  if (isInboxError(ctx)) return ctx;
  const result = await dispatchDueScheduled(ctx.admin, { orgId: ctx.orgId, limit: 10 });
  return NextResponse.json(result);
}
