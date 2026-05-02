import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { maybeCreateBudgetPendingFollowup } from "@/lib/fertility/followup-triggers";

const planItemSchema = z.object({
  service_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  unit_price: z.number().min(0).max(1000000),
});

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
  // New in v0.12: multi-service line items. If items provided, they drive
  // session creation (one session per unit in each item) and total_sessions
  // is ignored. If items is empty/missing, legacy behavior kicks in and
  // total_sessions creates N blank sessions (no service, no price).
  items: z.array(planItemSchema).max(20).optional(),
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
    .select("*, doctors(full_name, color), treatment_sessions(*), treatment_plan_items(*, services(id, name, duration_minutes))")
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

  const { items, ...planFields } = parsed.data;

  // If items are provided, derive total_sessions from them so legacy readers
  // still see a sensible number.
  const derivedTotalSessions =
    items && items.length > 0
      ? items.reduce((sum, it) => sum + it.quantity, 0)
      : planFields.total_sessions ?? null;

  const { data, error } = await supabase
    .from("treatment_plans")
    .insert({
      ...planFields,
      total_sessions: derivedTotalSessions,
      organization_id: membership.organization_id,
    })
    .select("*, doctors(full_name, color)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (items && items.length > 0) {
    // Validate services belong to this org (defense in depth — RLS also enforces).
    const serviceIds = Array.from(new Set(items.map((it) => it.service_id)));
    const { data: servicesCheck } = await supabase
      .from("services")
      .select("id")
      .in("id", serviceIds)
      .eq("organization_id", membership.organization_id);
    const validIds = new Set((servicesCheck ?? []).map((s) => s.id));
    if (serviceIds.some((id) => !validIds.has(id))) {
      // Roll back the plan we just created
      await supabase.from("treatment_plans").delete().eq("id", data.id);
      return NextResponse.json(
        { error: "Algún servicio no pertenece a tu organización" },
        { status: 400 }
      );
    }

    // Insert items
    const itemRows = items.map((it, i) => ({
      treatment_plan_id: data.id,
      organization_id: membership.organization_id,
      service_id: it.service_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      display_order: i,
    }));
    const { data: insertedItems, error: itemsErr } = await supabase
      .from("treatment_plan_items")
      .insert(itemRows)
      .select("id, service_id, quantity, unit_price");

    if (itemsErr || !insertedItems) {
      await supabase.from("treatment_plans").delete().eq("id", data.id);
      return NextResponse.json(
        { error: itemsErr?.message || "Error al crear items" },
        { status: 500 }
      );
    }

    // Expand items into individual sessions (qty per item).
    const sessions: Array<{
      treatment_plan_id: string;
      organization_id: string;
      session_number: number;
      status: "pending";
      service_id: string;
      session_price: number;
      treatment_plan_item_id: string;
    }> = [];
    let n = 1;
    for (const it of insertedItems) {
      for (let i = 0; i < it.quantity; i++) {
        sessions.push({
          treatment_plan_id: data.id,
          organization_id: membership.organization_id,
          session_number: n++,
          status: "pending",
          service_id: it.service_id,
          session_price: Number(it.unit_price),
          treatment_plan_item_id: it.id,
        });
      }
    }
    if (sessions.length > 0) {
      await supabase.from("treatment_sessions").insert(sessions);
    }
  } else if (derivedTotalSessions) {
    // Legacy path: no items, create blank sessions (no service, no price).
    const sessions = Array.from({ length: derivedTotalSessions }, (_, i) => ({
      treatment_plan_id: data.id,
      organization_id: membership.organization_id,
      session_number: i + 1,
      status: "pending" as const,
    }));
    await supabase.from("treatment_sessions").insert(sessions);
  }

  // Best-effort: create a fertility followup if the addon is enabled.
  // The helper no-ops silently if not, so we don't gate by status here —
  // if the org doesn't run fertility, isFertilityAddonEnabled returns false.
  await maybeCreateBudgetPendingFollowup(supabase, {
    organization_id: membership.organization_id,
    patient_id: parsed.data.patient_id,
    doctor_id: parsed.data.doctor_id,
  });

  return NextResponse.json({ data }, { status: 201 });
}
