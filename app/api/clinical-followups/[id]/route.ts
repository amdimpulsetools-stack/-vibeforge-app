import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  priority: z.enum(["red", "yellow", "green"]).optional(),
  reason: z.string().min(1).max(500).optional(),
  follow_up_date: z.string().nullable().optional(),
  is_resolved: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
  mark_contacted: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  // Verify followup belongs to user's org
  const { data: followup } = await supabase
    .from("clinical_followups")
    .select("organization_id")
    .eq("id", id)
    .single();
  if (!followup || followup.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { mark_contacted, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (parsed.data.is_resolved) {
    updateData.resolved_at = new Date().toISOString();
    updateData.resolved_by = user.id;
  }
  if (mark_contacted) {
    updateData.last_contacted_at = new Date().toISOString();
    updateData.contacted_by = user.id;
  }

  const { data, error } = await supabase
    .from("clinical_followups")
    .update(updateData)
    .eq("id", id)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  // Verify followup belongs to user's org
  const { data: followup } = await supabase
    .from("clinical_followups")
    .select("organization_id")
    .eq("id", id)
    .single();
  if (!followup || followup.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("clinical_followups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
