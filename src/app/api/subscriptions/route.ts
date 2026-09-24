import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { config } from "@/config";
import { expireStalePendingSubscriptions } from "@/lib/expire";
import { firstOfMonthStr, addDaysStr } from "@/lib/periods";
import { nowInAmsterdam } from "@/lib/date";
import { findConflictingBookingDates } from "@/lib/slots";

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

  const conflicts = await findConflictingBookingDates(weekday, dagdeelId);
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "Op dit dagdeel staan de komende weken al losse boekingen van andere bands. Kies een ander moment of neem contact op met het bestuur.",
      },
      { status: 409 }
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

  // Eerste betaalperiode = de huidige kalendermaand. Latere maanden worden door de
  // dagelijkse cron aangemaakt (zie /api/cron/subscriptions).
  const periodMonth = firstOfMonthStr(nowInAmsterdam());
  const dueDate = firstOfMonthStr(nowInAmsterdam());
  const graceUntil = addDaysStr(dueDate, config.subscriptionGraceDays);

  const { data: periodPayment, error: periodError } = await supabase
    .from("subscription_payments")
    .insert({
      subscription_id: subscription.id,
      period_month: periodMonth,
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
      description: `${config.roomName} - vaste reservering ${bandName} - ${periodMonth}`,
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
