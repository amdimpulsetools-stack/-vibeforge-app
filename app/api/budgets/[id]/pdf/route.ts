import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { generateBudgetPdf } from "@/lib/budget-pdf/generate";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

export const runtime = "nodejs"; // @react-pdf/renderer is not edge-safe.
// Puppeteer cold-start + chromium decompress + render typically lands at
// 8–15 s on Vercel. Default 10 s is too tight; 30 s gives headroom.
export const maxDuration = 30;

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/pdf
//
// Generates (or reuses) the PDF for a budget and returns a signed URL
// the client can open in a new tab. Reuse rule: if the row already has
// a `pdf_storage_path` AND `pdf_generated_at >= updated_at` we skip
// the render and only mint a new signed URL.
//
// Auth: any active org member with the fertility addon enabled.
// (Admins viewing accepted/rejected archived budgets is intentional.)
// ──────────────────────────────────────────────────────────────────

interface MembershipRow {
  organization_id: string;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const result = await generateBudgetPdf(supabase, admin, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    signed_url: result.result.signedUrl,
    storage_path: result.result.storagePath,
    reused: result.result.reused,
    size_bytes: result.result.sizeBytes,
  });
}
