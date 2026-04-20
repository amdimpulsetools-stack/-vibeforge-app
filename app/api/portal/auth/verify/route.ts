import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPortalSession } from "@/lib/portal-auth";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  slug: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { token, slug } = parsed.data;
  const supabase = createAdminClient();

  const { data: tokenRow } = await supabase
    .from("patient_portal_tokens")
    .select("id, organization_id, email, expires_at, used_at")
    .eq("token", token)
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  if (tokenRow.used_at) {
    return NextResponse.json({ error: "token_used" }, { status: 400 });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "token_expired" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("id", tokenRow.organization_id)
    .eq("slug", slug)
    .single();

  if (!org) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await supabase
    .from("patient_portal_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  const email = tokenRow.email.toLowerCase().trim();

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("organization_id", org.id)
    .eq("portal_email", email)
    .single();

  await createPortalSession(org.id, email, patient?.id || null);

  return NextResponse.json({
    success: true,
    needs_registration: !patient,
  });
}
