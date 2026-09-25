import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie, isPaymentInProgress } from "@/lib/mollie";
import { config } from "@/config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: periodPayment } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("pay_token", token)
    .maybeSingle();

  if (!periodPayment) {
    return NextResponse.json({ error: "Betaallink niet gevonden" }, { status: 404 });
  }

  if (periodPayment.status !== "unpaid") {
    return NextResponse.json(
      { error: "Deze periode is al betaald of hoeft niet meer betaald te worden" },
      { status: 400 }
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", periodPayment.subscription_id)
    .single();

  if (!subscription || subscription.status !== "active") {
    return NextResponse.json(
      { error: "Deze vaste reservering is niet meer actief" },
      { status: 400 }
    );
  }

  if (await isPaymentInProgress(periodPayment.mollie_payment_id)) {
    return NextResponse.json(
      { error: "Er loopt al een betaling voor deze periode. Even geduld - vernieuw de pagina over een minuutje." },
      { status: 409 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const priceStr = (periodPayment.amount_cents / 100).toFixed(2);

  try {
    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: priceStr },
      description: `${config.roomName} - vaste reservering ${subscription.band_name} - ${periodPayment.period_start} t/m ${periodPayment.period_end}`,
      redirectUrl: `${appUrl}/vaste-reservering/betalen?token=${token}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie-subscription`,
      metadata: { subscriptionId: subscription.id, periodPaymentId: periodPayment.id },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase
      .from("subscription_payments")
      .update({ mollie_payment_id: payment.id })
      .eq("id", periodPayment.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie period payment creation failed:", err);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
