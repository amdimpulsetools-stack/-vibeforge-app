import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const prescriptionSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  clinical_note_id: z.string().uuid().nullable().optional(),
  medication: z.string().min(1).max(200),
  dosage: z.string().max(100).nullable().optional(),
  frequency: z.string().max(100).nullable().optional(),
  duration: z.string().max(100).nullable().optional(),
  route: z.string().max(50).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  quantity: z.string().max(50).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const appointmentId = request.nextUrl.searchParams.get("appointment_id");

  let query = supabase
    .from("prescriptions")
    .select("*, doctors(full_name)")
    .order("created_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);
  if (appointmentId) query = query.eq("appointment_id", appointmentId);

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

  // Support batch creation (array of prescriptions)
  const isBatch = Array.isArray(body);
  const items: unknown[] = isBatch ? (body as unknown[]) : [body];

  const parsedItems = items.map((item: unknown) => prescriptionSchema.safeParse(item));
  const firstError = parsedItems.find((p: { success: boolean }) => !p.success);
  if (firstError && !firstError.success) {
    return NextResponse.json({ error: "Datos inválidos", details: firstError.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const insertData = parsedItems.map((p: { success: boolean; data?: z.infer<typeof prescriptionSchema> }) => ({
    ...(p as { success: true; data: z.infer<typeof prescriptionSchema> }).data,
    organization_id: membership.organization_id,
  }));

  const { data, error } = await supabase
    .from("prescriptions")
    .insert(insertData)
    .select("*, doctors(full_name)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: isBatch ? data : data?.[0] }, { status: 201 });
}
