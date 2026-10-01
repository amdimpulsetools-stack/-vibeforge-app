import { NextResponse } from "next/server";
import { isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

/** GET /api/inbox/templates — plantillas APROBADAS de la org para el composer. */
export async function GET() {
  const ctx = await requireInbox();
  if (isInboxError(ctx)) return ctx;
  const { data } = await ctx.admin
    .from("whatsapp_templates")
    .select("id, meta_template_name, language, category, body_text, variable_mapping")
    .eq("organization_id", ctx.orgId)
    .eq("status", "APPROVED")
    .order("meta_template_name");
  return NextResponse.json({ templates: data ?? [] });
}
