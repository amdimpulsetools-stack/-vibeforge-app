import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  // Resolve org + patient FK for the audit row. Fetch upfront —
  // cheap, and ensures the log fires even if we early-return.
  const { data: order } = await supabase
    .from("exam_orders")
    .select("organization_id, patient_id")
    .eq("id", id)
    .maybeSingle();

  // Update order status
  if (body.status) {
    const { error } = await supabase
      .from("exam_orders")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update individual item status
  if (body.item_id && body.item_status) {
    const updateData: Record<string, unknown> = { status: body.item_status };
    if (body.item_status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }
    if (body.result_notes !== undefined) {
      updateData.result_notes = body.result_notes;
    }

    const { error } = await supabase
      .from("exam_order_items")
      .update(updateData)
      .eq("id", body.item_id as string);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-update order status based on items
    const { data: items } = await supabase
      .from("exam_order_items")
      .select("status")
      .eq("order_id", id);

    if (items) {
      const allCompleted = items.every((i) => i.status === "completed");
      const someCompleted = items.some((i) => i.status === "completed");
      const newStatus = allCompleted ? "completed" : someCompleted ? "partial" : "pending";

      await supabase
        .from("exam_orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  }

  if (order?.organization_id) {
    logClinicalAccess({
      organizationId: order.organization_id,
      userId: user.id,
      resourceType: "lab_result",
      action: "update",
      patientId: order.patient_id ?? null,
      resourceId: id,
      metadata: {
        order_status: body.status ?? null,
        item_id: body.item_id ?? null,
        item_status: body.item_status ?? null,
      },
    });
  }

  return NextResponse.json({ success: true });
}
