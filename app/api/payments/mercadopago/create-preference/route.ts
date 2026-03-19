import { NextResponse } from "next/server";
import { getPreferenceClient } from "@/lib/mercadopago/client";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api-utils";
import { mpCreatePreferenceSchema } from "@/lib/validations/api";

export async function POST(request: Request) {
  // 1. Verify user is founder
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 2. Parse and validate request body
  const parsed = await parseBody(request, mpCreatePreferenceSchema);
  if (parsed.error) return parsed.error;
  const { plan_slug, billing_cycle } = parsed.data;

  // 3. Fetch plan from DB
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("slug", plan_slug)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const price =
    billing_cycle === "yearly" && plan.price_yearly
      ? Number(plan.price_yearly)
      : Number(plan.price_monthly);

  const title =
    billing_cycle === "yearly"
      ? `${plan.name} — Anual`
      : `${plan.name} — Mensual`;

  // 4. Create Mercado Pago preference
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const preferenceClient = getPreferenceClient();
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: plan.id,
            title,
            description: plan.description || `Plan ${plan.name}`,
            quantity: 1,
            currency_id: (plan.currency || "PEN").toUpperCase(),
            unit_price: price,
          },
        ],
        back_urls: {
          success: `${appUrl}/founder/integrations/result?status=approved`,
          failure: `${appUrl}/founder/integrations/result?status=rejected`,
          pending: `${appUrl}/founder/integrations/result?status=pending`,
        },
        payment_methods: {
          installments: 1,
        },
        external_reference: `founder_test_${user.id}_${plan_slug}_${Date.now()}`,
        metadata: {
          plan_slug,
          billing_cycle,
          user_id: user.id,
          test: true,
        },
      },
    });

    return NextResponse.json({
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (err: any) {
    console.error("MP Preference error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create preference" },
      { status: 500 }
    );
  }
}
