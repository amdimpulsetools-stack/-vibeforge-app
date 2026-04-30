import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";

// GET /api/clinical-document-templates — lista las plantillas de
// documentos (receta / nota / examen / consentimiento / plan) de la org
// del usuario. RLS las filtra por organization_id.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data, error } = await supabase
    .from("clinical_document_templates")
    .select("*")
    .order("slug");

  if (error) {
    console.error("Clinical document templates fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
