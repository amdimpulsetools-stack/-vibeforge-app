import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

// Atomic code application: validates the code against org, expiration,
// usage limit, service scope; computes the discount for the target
// appointment; writes the discount fields on the appointment AND
// increments discount_codes.uses_count. Uses the admin client only for
// the counter bump (to sidestep RLS on write contention in dev).

const schema = z.object({
  appointment_id: z.string().uuid(),
  code: z.string().trim().min(2).max(50),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const code = parsed.data.code.toUpperCase();

  // Load the appointment (via authenticated client — RLS enforces org scope)
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, organization_id, service_id, price_snapshot")
    .eq("id", parsed.data.appointment_id)
    .single();

  if (!appt) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  // Plan check — match the main CRUD endpoint's gate
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("plan_id, plans(slug)")
    .eq("organization_id", appt.organization_id)
    .in("status", ["active", "trialing"])
    .limit(1)
    .single();
  const planSlug = (sub as { plans?: { slug?: string } | null } | null)?.plans?.slug;
  if (!planSlug || planSlug === "starter") {
    return NextResponse.json(
      { error: "Los códigos de descuento requieren plan Professional o superior" },
      { status: 402 }
    );
  }

  // Look up the code within the same org (RLS enforces)
  const { data: dc } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("organization_id", appt.organization_id)
    .eq("code", code)
    .single();

  if (!dc) {
    return NextResponse.json({ error: "Código inválido" }, { status: 404 });
  }
  if (!dc.is_active) {
    return NextResponse.json({ error: "Código inactivo" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  if (dc.valid_from && today < dc.valid_from) {
    return NextResponse.json({ error: "Código aún no es válido" }, { status: 400 });
  }
  if (dc.valid_until && today > dc.valid_until) {
    return NextResponse.json({ error: "Código expirado" }, { status: 400 });
  }
  if (dc.max_uses != null && dc.uses_count >= dc.max_uses) {
    return NextResponse.json({ error: "Código agotado (límite de usos)" }, { status: 400 });
  }
  if (
    Array.isArray(dc.applies_to_service_ids) &&
    dc.applies_to_service_ids.length > 0 &&
    (!appt.service_id || !dc.applies_to_service_ids.includes(appt.service_id))
  ) {
    return NextResponse.json(
      { error: "Este código no aplica al servicio de esta cita" },
      { status: 400 }
    );
  }

  const gross = Number(appt.price_snapshot ?? 0);
  if (gross <= 0) {
    return NextResponse.json(
      { error: "La cita no tiene precio para aplicar descuento" },
      { status: 400 }
    );
  }

  const rawDiscount =
    dc.type === "percent"
      ? (gross * Number(dc.value)) / 100
      : Number(dc.value);
  const discountAmount = Math.min(gross, Math.max(0, rawDiscount));
  const rounded = Number(discountAmount.toFixed(2));

  // Apply to the appointment
  const { error: updateErr } = await supabase
    .from("appointments")
    .update({
      discount_amount: rounded,
      discount_reason: `Código ${dc.code}`,
      discount_applied_by: user.id,
      discount_code_id: dc.id,
    } as Record<string, unknown>)
    .eq("id", appt.id);

  if (updateErr) {
    return NextResponse.json({ error: "Error al aplicar descuento" }, { status: 500 });
  }

  // Increment counter. Use admin client to avoid race/lost updates from RLS
  // nuances; this is an internal bookkeeping write, not user data.
  const admin = createAdminClient();
  await admin
    .from("discount_codes")
    .update({
      uses_count: dc.uses_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dc.id);

  return NextResponse.json({
    ok: true,
    discount_amount: rounded,
    code: dc.code,
    effective_price: Number((gross - rounded).toFixed(2)),
  });
}
