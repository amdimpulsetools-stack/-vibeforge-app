import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/members/[id] — update member role
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

  const body = await request.json();
  const { role } = body as { role: string };

  if (!role || !["admin", "receptionist", "doctor"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be admin, receptionist, or doctor" },
      { status: 400 }
    );
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

  // Cannot change role of the owner
  if (targetMember.role === "owner") {
    return NextResponse.json(
      { error: "Cannot change role of owner" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/members/[id] — remove member
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

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
