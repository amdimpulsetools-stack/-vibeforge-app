import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

  return NextResponse.json({ success: true });
}
