import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/members — list organization members
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch all members in this org with their profile info
  const { data: members, error } = await supabase
    .from("organization_members")
    .select(
      `
      id,
      user_id,
      role,
      created_at,
      user_profiles:user_id (
        full_name,
        avatar_url,
        phone,
        email,
        professional_title
      )
    `
    )
    .eq("organization_id", membership.organization_id)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (members ?? []).map((m) => {
    const profile = m.user_profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
      email: string | null;
      professional_title: string | null;
    } | null;

    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      phone: profile?.phone ?? null,
      email: profile?.email ?? null,
      professional_title: profile?.professional_title ?? null,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/members — invite a new member by email
export async function POST(request: NextRequest) {
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
  const { email, role, professional_title } = body as {
    email: string;
    role: string;
    professional_title?: string | null;
  };

  if (!email || !role) {
    return NextResponse.json(
      { error: "Email and role are required" },
      { status: 400 }
    );
  }

  if (!["admin", "member"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be admin or member" },
      { status: 400 }
    );
  }

  if (
    professional_title &&
    !["doctor", "especialista", "licenciada"].includes(professional_title)
  ) {
    return NextResponse.json(
      { error: "Invalid professional_title" },
      { status: 400 }
    );
  }

  // Find user by email via RPC function
  const { data: targetUserId, error: rpcError } = await supabase.rpc(
    "find_user_by_email",
    { lookup_email: email }
  );

  if (rpcError || !targetUserId) {
    return NextResponse.json(
      { error: "user_not_found" },
      { status: 404 }
    );
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("organization_id", callerMembership.organization_id)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "already_member" },
      { status: 409 }
    );
  }

  // Remove from their current org if they have one (user can only be in one org)
  const { error: deleteError } = await supabase
    .from("organization_members")
    .delete()
    .eq("user_id", targetUserId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Error al remover membresía anterior: " + deleteError.message },
      { status: 500 }
    );
  }

  // Insert member into this org
  const { data: newMember, error } = await supabase
    .from("organization_members")
    .insert({
      user_id: targetUserId,
      organization_id: callerMembership.organization_id,
      role,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Set professional_title on the user's profile
  if (role === "member") {
    await supabase
      .from("user_profiles")
      .update({ professional_title: professional_title || null })
      .eq("id", targetUserId);
  }

  return NextResponse.json(newMember, { status: 201 });
}
