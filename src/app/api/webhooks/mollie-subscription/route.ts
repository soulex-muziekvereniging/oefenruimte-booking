import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { config } from "@/config";
import {
  sendSubscriptionConfirmationEmail,
  sendSubscriptionNotificationToOrg,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const paymentId = body.get("id") as string;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const payment = (await mollie.payments.get(paymentId)) as {
    status: string;
    sequenceType: string;
    mandateId?: string;
    customerId: string;
    metadata: { subscriptionId: string };
  };
  const subscriptionId = payment.metadata.subscriptionId;

  // Alleen de allereerste betaling activeert de vaste reservering. Latere maandelijkse
  // incasso's van de Mollie-subscription komen ook via deze webhook binnen (sequenceType
  // "recurring") en hoeven verder niets te doen - Mollie regelt de herhaling zelf.
  if (payment.sequenceType !== "first") {
    if (payment.status === "failed") {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", subscriptionId)
        .single();
      if (subscription) {
        await sendSubscriptionNotificationToOrg(subscription);
      }
    }
    return NextResponse.json({ received: true });
  }

  if (payment.status === "paid") {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .single();

    if (!subscription || !payment.mandateId) {
      return NextResponse.json({ received: true });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const priceStr = (subscription.price_cents / 100).toFixed(2);

    const mollieSubscription = await mollie.customerSubscriptions.create({
      customerId: payment.customerId,
      mandateId: payment.mandateId,
      amount: { currency: config.currency, value: priceStr },
      interval: "1 month",
      description: `${config.roomName} - vaste reservering ${subscription.band_name}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie-subscription`,
      metadata: { subscriptionId: subscription.id },
    });

    const { data: updated } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        mollie_mandate_id: payment.mandateId,
        mollie_subscription_id: mollieSubscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .select()
      .single();

    if (updated) {
      await sendSubscriptionConfirmationEmail(updated);
      await sendSubscriptionNotificationToOrg(updated);
    }
  } else if (
    payment.status === "expired" ||
    payment.status === "failed" ||
    payment.status === "canceled"
  ) {
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", subscriptionId);
  }

  return NextResponse.json({ received: true });
}
