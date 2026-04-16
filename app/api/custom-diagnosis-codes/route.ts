import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface CustomDiagnosisCode {
  id: string;
  organization_id: string;
  code: string;
  label: string;
  specialty_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/custom-diagnosis-codes — list org's custom codes
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("custom_diagnosis_codes")
    .select("*")
    .order("code");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/custom-diagnosis-codes — add a new code
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const label = String(body.label ?? "").trim();
  const specialty_id = body.specialty_id || null;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!code || !label) {
    return NextResponse.json({ error: "code_and_label_required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_diagnosis_codes")
    .insert({
      organization_id: membership.organization_id,
      code,
      label,
      specialty_id,
      notes,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "code_already_exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/custom-diagnosis-codes — update label, specialty or notes
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, label, specialty_id, notes } = body;
  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof label === "string") update.label = label.trim();
  if (specialty_id !== undefined) update.specialty_id = specialty_id || null;
  if (notes !== undefined) update.notes = notes ? String(notes).trim() : null;

  const { data, error } = await supabase
    .from("custom_diagnosis_codes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/custom-diagnosis-codes?id=... — remove a code
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("custom_diagnosis_codes")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
