import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/plans — list all active plans (public catalog)
//
// NOTA: aquí existía un POST de "cambio de plan" (Wave 2 Sprint 1, mig 148)
// que NINGUNA UI llamaba — el cambio de plan real va por
// /api/mercadopago/checkout (preapproval nueva + el webhook cancela la
// vieja vía cancelSupersededSubscriptions). Se eliminó en la auditoría de
// billing 2026-08-07: permitía renovarse el trial indefinidamente por API
// (insertaba una sub trialing nueva con +14 días sin límite) y sincronizaba
// el monto mensual sobre preapprovals sin mirar la frecuencia. Si algún día
// se necesita cambio de plan sin re-checkout, debe reconstruirse sobre el
// camino del webhook, no revivir ese handler.
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("Plans fetch error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
}
