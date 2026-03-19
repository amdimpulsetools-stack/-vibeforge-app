import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  diagnosis_code: z.string().max(20).nullable().optional(),
  diagnosis_label: z.string().max(200).nullable().optional(),
  status: z.enum(["active", "completed", "cancelled", "paused"]).optional(),
  total_sessions: z.number().int().min(1).max(100).nullable().optional(),
  start_date: z.string().nullable().optional(),
  estimated_end_date: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const sessionUpdateSchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(["pending", "completed", "missed", "cancelled"]),
  appointment_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Check if this is a session update
  const sessionParsed = sessionUpdateSchema.safeParse(body);
  if (sessionParsed.success) {
    const { session_id, status, appointment_id, notes } = sessionParsed.data;
    const updateData: Record<string, unknown> = { status };
    if (status === "completed") updateData.completed_at = new Date().toISOString();
    if (appointment_id !== undefined) updateData.appointment_id = appointment_id;
    if (notes !== undefined) updateData.notes = notes;

    const { error } = await supabase
      .from("treatment_sessions")
      .update(updateData)
      .eq("id", session_id)
      .eq("treatment_plan_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Re-fetch full plan with sessions
    const { data } = await supabase
      .from("treatment_plans")
      .select("*, doctors(full_name, color), treatment_sessions(*)")
      .eq("id", id)
      .single();

    return NextResponse.json({ data });
  }

  // Plan update
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { data, error } = await supabase
    .from("treatment_plans")
    .update(parsed.data)
    .eq("id", id)
    .select("*, doctors(full_name, color), treatment_sessions(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("treatment_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
