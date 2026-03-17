import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalNoteUpdateSchema, signNoteSchema } from "@/lib/validations/api";

// PATCH /api/clinical-notes/[id] — Update a clinical note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Check if this is a sign request
  let raw: unknown;
  try {
    raw = await request.clone().json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isSignRequest = (raw as any)?.is_signed === true;

  if (isSignRequest) {
    // Sign the note — lock it from further edits
    const parsed = signNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("clinical_notes")
      .update({
        is_signed: true,
        signed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, doctors(full_name, color)")
      .single();

    if (error) {
      console.error("Clinical note sign error:", error);
      return NextResponse.json({ error: "Error al firmar nota clínica" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // Regular update
  const parsed = await parseBody(
    new Request(request.url, {
      method: "PATCH",
      body: JSON.stringify(raw),
      headers: request.headers,
    }),
    clinicalNoteUpdateSchema
  );
  if (parsed.error) return parsed.error;

  const { data, error } = await supabase
    .from("clinical_notes")
    .update({
      ...parsed.data,
      vitals: parsed.data.vitals ?? undefined,
    })
    .eq("id", id)
    .select("*, doctors(full_name, color)")
    .single();

  if (error) {
    console.error("Clinical note update error:", error);
    return NextResponse.json({ error: "Error al actualizar nota clínica" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/clinical-notes/[id] — Delete a clinical note (admin only, enforced by RLS)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const { error } = await supabase
    .from("clinical_notes")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Clinical note delete error:", error);
    return NextResponse.json({ error: "Error al eliminar nota clínica" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
