import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import {
  sendSubscriptionConfirmationEmail,
  sendSubscriptionNotificationToOrg,
  sendPeriodPaymentConfirmationEmail,
} from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";

// Deze webhook verwerkt betalingen voor een periode (kalendermaand) van een vaste
// reservering - zowel de allereerste betaling als elke latere maandelijkse betaling.
// Er is geen Mollie-mandaat/customerSubscription meer: elke maand is gewoon een losse
// betaling met een eigen /api/subscriptions/payments/[token]-link (zie /lib/cron).
export async function POST(request: NextRequest) {
  const body = await request.formData();
  const paymentId = body.get("id") as string;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const payment = (await mollie.payments.get(paymentId)) as {
    status: string;
    metadata: { subscriptionId: string; periodPaymentId: string };
  };
  const { subscriptionId, periodPaymentId } = payment.metadata;

  if (payment.status === "paid") {
    // Conditionele update: een vertraagde of dubbele webhook-aflevering mag een al
    // verwerkte periode niet nogmaals activeren of dubbele mails versturen.
    const { data: periodPayment } = await supabase
      .from("subscription_payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", periodPaymentId)
      .eq("status", "unpaid")
      .select()
      .single();

    if (!periodPayment) {
      return NextResponse.json({ received: true });
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .single();

    if (!subscription) {
      return NextResponse.json({ received: true });
    }

    if (subscription.status === "pending_first_payment") {
      const { data: activated } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          term_start_date: periodPayment.period_month,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .eq("status", "pending_first_payment")
        .select()
        .single();

      if (activated) {
        const bandEmails = await getActiveMemberEmails(activated.band_name);
        await sendSubscriptionConfirmationEmail(activated, bandEmails);
        await sendSubscriptionNotificationToOrg(activated);
      }
    } else if (subscription.status === "active") {
      const bandEmails = await getActiveMemberEmails(subscription.band_name);
      await sendPeriodPaymentConfirmationEmail(subscription, periodPayment, bandEmails);
    } else {
      // Betaling voor een inmiddels opgezegde/vervallen reservering (zeldzame race
      // conditie) - geld is binnen, maar dit vergt een handmatige check door het bestuur.
      console.error(
        `Betaling ${paymentId} ontvangen voor subscription ${subscriptionId} met status "${subscription.status}" - handmatig controleren.`
      );
    }
  } else if (
    payment.status === "expired" ||
    payment.status === "failed" ||
    payment.status === "canceled"
  ) {
    // Alleen de allereerste betaling annuleert de hele aanvraag en geeft het
    // weekdag+dagdeel vrij. Een mislukte latere maandbetaling laat de al actieve
    // reservering gewoon staan - de cron stuurt herinneringen en bewaakt de coulance.
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .eq("status", "pending_first_payment")
      .single();

    if (subscription) {
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", subscriptionId)
        .eq("status", "pending_first_payment");
    }
  }

  return NextResponse.json({ received: true });
}
