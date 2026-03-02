import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { APP_URL } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { plan_id, billing_cycle = "monthly" } = await request.json();

    if (!plan_id) {
      return NextResponse.json(
        { error: "plan_id es requerido" },
        { status: 400 }
      );
    }

    // Obtener plan
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Plan no encontrado" },
        { status: 404 }
      );
    }

    const amount =
      billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
    const frequency = billing_cycle === "yearly" ? 12 : 1;
    const frequencyType = "months";
    const cycleLabel = billing_cycle === "yearly" ? "Anual" : "Mensual";

    // Crear suscripción en Mercado Pago (PreApproval)
    const preApproval = getPreApprovalClient();
    const result = await preApproval.create({
      body: {
        reason: `VibeForge - Plan ${plan.name} (${cycleLabel})`,
        auto_recurring: {
          frequency,
          frequency_type: frequencyType,
          transaction_amount: Number(amount),
          currency_id: "PEN",
        },
        back_url: `${APP_URL}/select-plan?payment=callback`,
        external_reference: JSON.stringify({
          user_id: user.id,
          plan_id: plan.id,
          billing_cycle,
        }),
        payer_email: user.email,
      },
    });

    // Guardar suscripción pendiente en DB
    await supabase.from("organization_subscriptions").insert({
      user_id: user.id,
      plan_id: plan.id,
      status: "pending",
      billing_cycle,
      mp_preapproval_id: result.id,
    });

    return NextResponse.json({
      init_point: result.init_point,
      subscription_id: result.id,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Error al crear checkout" },
      { status: 500 }
    );
  }
}
