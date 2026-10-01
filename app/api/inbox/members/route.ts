import { NextRequest, NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

/** GET /api/inbox/members — miembros activos de la org (para "Avisar y asignar"). */
export async function GET(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const { data: members } = await ctx.admin.from("organization_members").select("user_id, role").eq("organization_id", ctx.orgId).eq("is_active", true).limit(200);
  const ids = (members ?? []).map((m) => m.user_id as string);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await ctx.admin.from("user_profiles").select("id, full_name").in("id", ids);
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) names.set(p.id, p.full_name ?? "");
  }
  return NextResponse.json({
    members: (members ?? []).map((m) => ({ user_id: m.user_id, role: m.role, full_name: names.get(m.user_id as string) || "Miembro" })),
  });
}
