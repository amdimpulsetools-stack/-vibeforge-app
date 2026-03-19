import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const treatmentPlanSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  diagnosis_code: z.string().max(20).nullable().optional(),
  diagnosis_label: z.string().max(200).nullable().optional(),
  status: z.enum(["active", "completed", "cancelled", "paused"]).default("active"),
  total_sessions: z.number().int().min(1).max(100).nullable().optional(),
  start_date: z.string().nullable().optional(),
  estimated_end_date: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");

  let query = supabase
    .from("treatment_plans")
    .select("*, doctors(full_name, color), treatment_sessions(*)")
    .order("created_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = treatmentPlanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { data, error } = await supabase
    .from("treatment_plans")
    .insert({ ...parsed.data, organization_id: membership.organization_id })
    .select("*, doctors(full_name, color)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create sessions if total_sessions specified
  if (parsed.data.total_sessions) {
    const sessions = Array.from({ length: parsed.data.total_sessions }, (_, i) => ({
      treatment_plan_id: data.id,
      organization_id: membership.organization_id,
      session_number: i + 1,
      status: "pending" as const,
    }));
    await supabase.from("treatment_sessions").insert(sessions);
  }

  return NextResponse.json({ data }, { status: 201 });
}
