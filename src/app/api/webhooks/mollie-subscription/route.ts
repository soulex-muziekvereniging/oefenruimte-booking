import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import {
  sendSubscriptionConfirmationEmail,
  sendSubscriptionNotificationToOrg,
  sendPeriodPaymentConfirmationEmail,
  sendAdminAlertToOrg,
  sendSafely,
} from "@/lib/email";
import type { Subscription } from "@/lib/supabase";
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

    // Een nooit geactiveerde aanvraag die op "cancelled" staat zonder cancelled_at, is
    // automatisch verlopen omdat de eerste betaling te lang duurde (expire.ts) - niet door
    // de band of het bestuur opgezegd. Komt die betaling nu alsnog binnen, dan alsnog
    // activeren als het weekdag+dagdeel nog vrij is.
    const neverActivated =
      subscription.status === "pending_first_payment" ||
      (subscription.status === "cancelled" &&
        !subscription.term_start_date &&
        !subscription.cancelled_at);

    if (neverActivated) {
      const { data: activated } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          term_start_date: periodPayment.period_month,
          cancelled_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .eq("status", subscription.status)
        .select()
        .maybeSingle();

      if (activated) {
        const bandEmails = await getActiveMemberEmails(activated.band_name, activated.contact_email);
        await sendSafely("bevestiging vaste reservering", () =>
          sendSubscriptionConfirmationEmail(activated, bandEmails)
        );
        await sendSafely("melding vaste reservering bestuur", () =>
          sendSubscriptionNotificationToOrg(activated)
        );
      } else {
        // Activeren mislukt, meestal omdat een andere band dit weekdag+dagdeel intussen
        // heeft (unieke index) - geld terug.
        await refundAndAlert(subscription, paymentId, periodPayment.id, periodPayment.amount_cents);
      }
    } else if (subscription.status === "active") {
      const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
      await sendSafely("betaalbevestiging periode", () =>
        sendPeriodPaymentConfirmationEmail(subscription, periodPayment, bandEmails)
      );
    } else {
      // Betaling voor een inmiddels opgezegde/vervallen reservering (zeldzame race
      // conditie) - geld is binnen, maar dit vergt een beslissing van het bestuur.
      await sendSafely("melding betaling na opzeggen", () =>
        sendAdminAlertToOrg(
          `betaling van ${subscription.band_name} na opzeggen`,
          `${subscription.band_name} (${subscription.contact_email}) betaalde een periode van hun vaste reservering, maar die staat op "${subscription.status}". Controleer in Mollie (betaling ${paymentId}) of terugbetalen nodig is.`
        )
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

async function refundAndAlert(
  subscription: Subscription,
  paymentId: string,
  periodPaymentId: string,
  amountCents: number
) {
  let refunded = false;
  try {
    await mollie.paymentRefunds.create({
      paymentId,
      amount: { currency: "EUR", value: (amountCents / 100).toFixed(2) },
    });
    refunded = true;
    await supabase
      .from("subscription_payments")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", periodPaymentId);
  } catch (err) {
    console.error(`Terugbetaling van te late betaling ${paymentId} mislukt:`, err);
  }

  await sendSafely("melding te late betaling vaste reservering", () =>
    sendAdminAlertToOrg(
      `te late betaling van ${subscription.band_name}`,
      `${subscription.band_name} (${subscription.contact_email}) betaalde de eerste periode van een vaste reservering, maar pas nadat de aanvraag was verlopen en het tijdslot inmiddels door een andere band is vastgelegd. ` +
        (refunded
          ? "Het bedrag is automatisch teruggestort via Mollie."
          : `Automatisch terugstorten lukte niet - stort handmatig terug via Mollie (betaling ${paymentId}).`)
    )
  );
}
