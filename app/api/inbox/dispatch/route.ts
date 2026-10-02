import { NextRequest, NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { dispatchDueScheduled } from "@/lib/inbox/dispatch";
import { tickFlowRuns } from "@/lib/inbox/flows/runtime";

export const runtime = "nodejs";

/** POST /api/inbox/dispatch — programados vencidos de la PROPIA org
 *  (respaldo mientras la pantalla está abierta; ver cron/inbox-dispatch). */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const result = await dispatchDueScheduled(ctx.admin, { orgId: ctx.orgId, limit: 10 });
  const flows = await tickFlowRuns(ctx.admin, { orgId: ctx.orgId, limit: 10 });
  return NextResponse.json({ ...result, flows });
}
