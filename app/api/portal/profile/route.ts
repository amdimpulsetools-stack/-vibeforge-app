import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { slug, portal_phone } = body as {
    slug?: string;
    portal_phone?: string;
  };

  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const session = await getPortalSession(slug);
  if (!session || !session.patient_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const trimmed = typeof portal_phone === "string" ? portal_phone.trim() : "";
  if (trimmed.length > 30) {
    return NextResponse.json(
      { error: "Teléfono demasiado largo" },
      { status: 400 }
    );
  }
  if (trimmed && !/^[+\d\s()-]{6,30}$/.test(trimmed)) {
    return NextResponse.json(
      { error: "Formato de teléfono inválido" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("patients")
    .update({ portal_phone: trimmed || null })
    .eq("id", session.patient_id)
    .eq("organization_id", session.organization_id);

  if (error) {
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, portal_phone: trimmed || null });
}
