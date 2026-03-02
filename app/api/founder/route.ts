import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/founder — platform-level stats (founder only)
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a founder
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_founder_stats");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
