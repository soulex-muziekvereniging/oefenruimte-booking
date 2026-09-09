import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { config } from "@/config";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { bandName, contactName, contactEmail, contactPhone, weekday, dagdeelId, frequency } = body;

  if (
    !bandName ||
    !contactName ||
    !contactEmail ||
    weekday === undefined ||
    weekday === null ||
    !dagdeelId ||
    !frequency
  ) {
    return NextResponse.json(
      { error: "Vul alle verplichte velden in" },
      { status: 400 }
    );
  }

  if (!config.dagdelen.some((d) => d.id === dagdeelId)) {
    return NextResponse.json({ error: "Ongeldig dagdeel" }, { status: 400 });
  }

  if (!(frequency in config.subscriptionPricing)) {
    return NextResponse.json({ error: "Ongeldige frequentie" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", contactEmail.toLowerCase().trim())
    .eq("active", true)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      {
        error: `Dit e-mailadres staat niet geregistreerd als lid van ${config.organizationName}. Neem contact op om lid te worden voordat je kan boeken.`,
      },
      { status: 403 }
    );
  }

  const priceCents = config.subscriptionPricing[frequency as "weekly" | "biweekly"].priceCentsPerMonth;

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      weekday,
      dagdeel_id: dagdeelId,
      frequency,
      price_cents: priceCents,
      status: "pending_first_payment",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Dit weekdag en dagdeel is al vast gereserveerd door een andere band" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const priceStr = (priceCents / 100).toFixed(2);

  try {
    const customer = await mollie.customers.create({
      name: contactName,
      email: contactEmail,
    });

    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: priceStr },
      description: `${config.roomName} - vaste reservering ${bandName} - eerste maand`,
      customerId: customer.id,
      sequenceType: "first",
      redirectUrl: `${appUrl}/subscription/success?id=${subscription.id}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie-subscription`,
      metadata: { subscriptionId: subscription.id },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase
      .from("subscriptions")
      .update({ mollie_customer_id: customer.id, mollie_first_payment_id: payment.id })
      .eq("id", subscription.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie subscription first payment creation failed:", err);
    // Betaling kon niet gestart worden - laat het weekdag+dagdeel niet als bezet achter.
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
