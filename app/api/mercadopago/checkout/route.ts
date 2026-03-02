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

    const { plan_id, billing_cycle = "monthly", org_name } = await request.json();

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

    // 1. Crear organización para el usuario
    const orgSlug = (org_name || user.email?.split("@")[0] || "mi-clinica")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: org_name || `Clínica de ${user.user_metadata?.full_name || user.email}`,
        slug: `${orgSlug}-${Date.now()}`,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (orgError) {
      console.error("Error creating organization:", orgError);
      return NextResponse.json(
        { error: `Error al crear la organización: ${orgError.message} (${orgError.code})` },
        { status: 500 }
      );
    }

    // 2. Agregar al usuario como owner de la organización
    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      console.error("Error adding member:", memberError);
      return NextResponse.json(
        { error: `Error al agregar miembro: ${memberError.message} (${memberError.code})` },
        { status: 500 }
      );
    }

    // 3. Crear suscripción en Mercado Pago (PreApproval)
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
          organization_id: org.id,
          billing_cycle,
        }),
        payer_email: user.email,
      },
    });

    // 4. Guardar suscripción pendiente en DB
    await supabase.from("organization_subscriptions").insert({
      organization_id: org.id,
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Error al crear checkout: ${message}` },
      { status: 500 }
    );
  }
}
