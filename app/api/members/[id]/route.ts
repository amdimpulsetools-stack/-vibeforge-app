import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api-utils";
import { updateMemberSchema } from "@/lib/validations/api";

// PATCH /api/members/[id] — update member role or is_active status
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

  // Verify caller is admin/owner
  const { data: callerMembership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!callerMembership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  if (
    callerMembership.role !== "owner" &&
    callerMembership.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseBody(request, updateMemberSchema);
  if (parsed.error) return parsed.error;
  const { role, is_active } = parsed.data;

  // Get the target member
  const { data: targetMember } = await supabase
    .from("organization_members")
    .select("id, user_id, role, organization_id")
    .eq("id", id)
    .eq("organization_id", callerMembership.organization_id)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot modify the owner
  if (targetMember.role === "owner") {
    return NextResponse.json(
      { error: "Cannot modify owner" },
      { status: 403 }
    );
  }

  // Cannot deactivate yourself
  if (typeof is_active === "boolean" && !is_active && targetMember.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot deactivate yourself" },
      { status: 403 }
    );
  }

  // Handle is_active toggle
  if (typeof is_active === "boolean") {
    const { error } = await supabase
      .from("organization_members")
      .update({ is_active })
      .eq("id", id);

    if (error) {
      console.error("Member update error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    // DB trigger handles doctor deactivation/reactivation automatically
    return NextResponse.json({ success: true });
  }

  // Handle role change
  if (!role || !["admin", "receptionist", "doctor"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be admin, receptionist, or doctor" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", id);

  if (error) {
    console.error("Member update error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/members/[id] — remove member (also deactivates linked doctor via DB trigger)
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

  // Verify caller is admin/owner
  const { data: callerMembership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!callerMembership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  if (
    callerMembership.role !== "owner" &&
    callerMembership.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get the target member
  const { data: targetMember } = await supabase
    .from("organization_members")
    .select("id, user_id, role, organization_id")
    .eq("id", id)
    .eq("organization_id", callerMembership.organization_id)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot remove the owner
  if (targetMember.role === "owner") {
    return NextResponse.json(
      { error: "Cannot remove owner" },
      { status: 403 }
    );
  }

  // Cannot remove yourself
  if (targetMember.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 403 }
    );
  }

  // DB trigger deactivate_doctor_on_member_delete handles doctor deactivation
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Member update error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
