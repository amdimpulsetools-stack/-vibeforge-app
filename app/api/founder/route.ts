import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFounder } from "@/lib/require-founder";

// GET /api/founder — platform-level stats (founder only)
export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_founder_stats");

  if (error) {
    console.error("Founder stats error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data);
}
