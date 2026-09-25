import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { config } from "@/config";
import { expireStalePendingSubscriptions } from "@/lib/expire";
import { addDaysStr } from "@/lib/periods";
import { findSubscriptionConflict } from "@/lib/slots";
import { periodEndFor, weekdayOf } from "@/lib/schedule";
import { checkStartDate, conflictMessage, parseSubscriptionInput } from "@/lib/subscriptionRequest";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { bandName, contactName, contactEmail, contactPhone } = body;

  if (!bandName || !contactName || !contactEmail) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  const parsed = parseSubscriptionInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { startDate, dagdeelId, frequency } = parsed.value;
  const startError = checkStartDate(parsed.value);
  if (startError) {
    return NextResponse.json({ error: startError }, { status: 400 });
  }

  await expireStalePendingSubscriptions();

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

  const conflict = await findSubscriptionConflict({
    dagdeel_id: dagdeelId,
    frequency,
    start_date: startDate,
  });
  if (conflict) {
    return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });
  }

  const priceCents = config.subscriptionPricing[frequency].priceCentsPerPeriod;

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      weekday: weekdayOf(startDate),
      dagdeel_id: dagdeelId,
      frequency,
      start_date: startDate,
      price_cents: priceCents,
      status: "pending_first_payment",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  // Nog een keer checken ná het opslaan: vangt twee aanvragen die tegelijk binnenkwamen
  // (er is geen unieke index meer, want om de week mogen twee bands één dagdeel delen).
  const raced = await findSubscriptionConflict(
    { dagdeel_id: dagdeelId, frequency, start_date: startDate },
    subscription.id
  );
  if (raced?.kind === "subscription") {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json({ error: conflictMessage(raced) }, { status: 409 });
  }

  // Eerste betaalperiode = de eerste 4 weken vanaf de startdatum; die wordt nu meteen
  // betaald. Volgende periodes zet de dagelijkse cron klaar (zie /api/cron/subscriptions).
  const dueDate = startDate;
  const graceUntil = addDaysStr(dueDate, config.subscriptionGraceDays);

  const { data: periodPayment, error: periodError } = await supabase
    .from("subscription_payments")
    .insert({
      subscription_id: subscription.id,
      period_start: startDate,
      period_end: periodEndFor(startDate),
      amount_cents: priceCents,
      due_date: dueDate,
      grace_until: graceUntil,
      status: "unpaid",
    })
    .select()
    .single();

  if (periodError || !periodPayment) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const priceStr = (priceCents / 100).toFixed(2);

  try {
    // Gewone eenmalige betaling, geen mandaat/incasso meer - dus ook gewoon weer
    // iDEAL en andere methodes beschikbaar, niet alleen creditcard.
    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: priceStr },
      description: `${config.roomName} - vaste reservering ${bandName} - vanaf ${startDate}`,
      redirectUrl: `${appUrl}/subscription/success?id=${subscription.id}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie-subscription`,
      metadata: { subscriptionId: subscription.id, periodPaymentId: periodPayment.id },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase
      .from("subscription_payments")
      .update({ mollie_payment_id: payment.id })
      .eq("id", periodPayment.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie subscription first payment creation failed:", err);
    // Betaling kon niet gestart worden - laat het weekdag+dagdeel niet als bezet achter.
    // Eerst de periode verwijderen, anders blokkeert de foreign key het verwijderen
    // van de subscription.
    await supabase.from("subscription_payments").delete().eq("id", periodPayment.id);
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
