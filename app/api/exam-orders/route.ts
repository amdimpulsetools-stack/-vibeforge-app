import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const examOrderSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  clinical_note_id: z.string().uuid().nullable().optional(),
  diagnosis: z.string().max(500).nullable().optional(),
  diagnosis_code: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(z.object({
    exam_catalog_id: z.string().uuid().nullable().optional(),
    exam_name: z.string().min(1).max(200),
    instructions: z.string().max(500).nullable().optional(),
  })).min(1),
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
    .from("exam_orders")
    .select("*, doctors(full_name), exam_order_items(*)")
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

  const parsed = examOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { items, ...orderData } = parsed.data;

  // Server-side guard: if the linked clinical note is signed, forbid creating new orders
  if (orderData.appointment_id) {
    const { data: note } = await supabase
      .from("clinical_notes")
      .select("is_signed")
      .eq("appointment_id", orderData.appointment_id)
      .maybeSingle();
    if (note?.is_signed === true) {
      return NextResponse.json(
        { error: "La nota clínica está firmada. No se pueden crear nuevas órdenes de exámenes." },
        { status: 403 }
      );
    }
  }

  // Create order
  const { data: order, error: orderError } = await supabase
    .from("exam_orders")
    .insert({
      ...orderData,
      organization_id: membership.organization_id,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  // Create order items
  const itemsData = items.map((item) => ({
    order_id: order.id,
    exam_catalog_id: item.exam_catalog_id || null,
    exam_name: item.exam_name,
    instructions: item.instructions || null,
  }));

  const { error: itemsError } = await supabase
    .from("exam_order_items")
    .insert(itemsData);

  if (itemsError) {
    console.error("Error inserting exam items:", itemsError);
  }

  // Fetch complete order with items
  const { data: complete } = await supabase
    .from("exam_orders")
    .select("*, doctors(full_name), exam_order_items(*)")
    .eq("id", order.id)
    .single();

  return NextResponse.json({ data: complete }, { status: 201 });
}
