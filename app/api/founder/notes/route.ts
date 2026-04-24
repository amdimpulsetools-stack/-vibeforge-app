import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";
import { z } from "zod";

const noteSchema = z.object({
  organization_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("founder_notes")
    .insert({
      organization_id: parsed.data.organization_id,
      author_id: ctx.userId,
      content: parsed.data.content,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("id");
  if (!noteId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("founder_notes").delete().eq("id", noteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
