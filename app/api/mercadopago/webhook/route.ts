import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient, getPaymentClient } from "@/lib/mercadopago/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    const supabase = await createClient();

    if (type === "subscription_preapproval") {
      // Evento de suscripción
      const preApproval = getPreApprovalClient();
      const subscription = await preApproval.get({ id: data.id });

      if (!subscription.external_reference) {
        return NextResponse.json({ received: true });
      }

      const ref = JSON.parse(subscription.external_reference);

      // Mapear status de MP a nuestro status
      let status = "pending";
      if (subscription.status === "authorized") status = "active";
      else if (subscription.status === "paused") status = "past_due";
      else if (subscription.status === "cancelled") status = "cancelled";
      else if (subscription.status === "pending") status = "pending";

      // Actualizar suscripción en DB
      await supabase
        .from("organization_subscriptions")
        .update({
          status,
          mp_subscription_id: subscription.id?.toString(),
          current_period_start: subscription.date_created,
          current_period_end: subscription.next_payment_date,
        })
        .eq("mp_preapproval_id", data.id);

      console.log(
        `Subscription ${data.id} updated to ${status} for user ${ref.user_id}`
      );
    } else if (type === "payment") {
      // Evento de pago
      const paymentClient = getPaymentClient();
      const payment = await paymentClient.get({ id: data.id });

      if (payment.external_reference) {
        const ref = JSON.parse(payment.external_reference);

        // Registrar en historial de pagos
        await supabase.from("payment_history").insert({
          user_id: ref.user_id,
          mp_payment_id: payment.id?.toString(),
          amount: payment.transaction_amount ?? 0,
          currency: payment.currency_id ?? "PEN",
          status: payment.status === "approved" ? "approved" : "rejected",
          payment_type: "subscription",
          description: payment.description,
          raw_data: payment as unknown as Record<string, unknown>,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
