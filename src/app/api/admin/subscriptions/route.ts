import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import type { SubscriptionPayment } from "@/lib/supabase";
import { config } from "@/config";
import { firstOfMonthStr, addDaysStr, pickActionablePeriod } from "@/lib/periods";
import { nowInAmsterdam } from "@/lib/date";
import { findConflictingBookingDates, findRunningOutSubscriptionEnd } from "@/lib/slots";
import { sendSubscriptionConfirmationEmail, sendSafely } from "@/lib/email";

export async function GET(request: NextRequest) {
  const authError = verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("status", { ascending: true })
    .order("weekday", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Kon vaste reserveringen niet ophalen" },
      { status: 500 }
    );
  }

  // Voeg per reservering de periode toe waar actie op nodig is, zodat het admin-scherm
  // de betaalstatus (en kwijtschelden/coulance) op de juiste maand toont.
  const { data: payments } = await supabase.from("subscription_payments").select("*");

  const paymentsBySubscription = new Map<string, SubscriptionPayment[]>();
  for (const payment of (payments ?? []) as SubscriptionPayment[]) {
    const list = paymentsBySubscription.get(payment.subscription_id) ?? [];
    list.push(payment);
    paymentsBySubscription.set(payment.subscription_id, list);
  }

  const currentMonth = firstOfMonthStr(nowInAmsterdam());
  const withPeriod = data.map((subscription) => ({
    ...subscription,
    currentPeriod: pickActionablePeriod(
      paymentsBySubscription.get(subscription.id) ?? [],
      currentMonth
    ),
  }));

  return NextResponse.json(withPeriod);
}

// Handmatig een vaste reservering toevoegen (bv. een bestaande afspraak van vóór dit
// systeem overzetten) - komt direct als "active" binnen, geen eerste Mollie-betaling
// nodig. De lopende periode wordt kwijtgescholden; vanaf de eerstvolgende kalendermaand
// loopt het gewoon mee met de normale, dagelijkse betaalcyclus (zie /api/cron/subscriptions).
export async function POST(request: NextRequest) {
  const authError = verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json();
  const { bandName, contactName, contactEmail, contactPhone, weekday, dagdeelId, frequency } =
    body;

  if (
    !bandName ||
    !contactName ||
    !contactEmail ||
    weekday === undefined ||
    weekday === null ||
    !dagdeelId ||
    !frequency
  ) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  if (!config.dagdelen.some((d) => d.id === dagdeelId)) {
    return NextResponse.json({ error: "Ongeldig dagdeel" }, { status: 400 });
  }

  if (!(frequency in config.subscriptionPricing)) {
    return NextResponse.json({ error: "Ongeldige frequentie" }, { status: 400 });
  }

  const runningOutUntil = await findRunningOutSubscriptionEnd(weekday, dagdeelId);
  if (runningOutUntil) {
    return NextResponse.json(
      {
        error: `Hier loopt nog een opgezegde vaste reservering tot en met ${new Date(runningOutUntil + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}. Verwijder die eerst (tab Vaste reserveringen) als het slot eerder vrij mag.`,
      },
      { status: 409 }
    );
  }

  const conflicts = await findConflictingBookingDates(weekday, dagdeelId);
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: `Er staan al losse boekingen op dit weekdag+dagdeel (${conflicts.join(", ")}). Annuleer of verplaats die eerst.`,
      },
      { status: 409 }
    );
  }

  const priceCents =
    config.subscriptionPricing[frequency as "weekly"].priceCentsPerMonth;
  const periodMonth = firstOfMonthStr(nowInAmsterdam());

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
      status: "active",
      term_start_date: periodMonth,
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

  const graceUntil = addDaysStr(periodMonth, config.subscriptionGraceDays);

  const { error: periodError } = await supabase.from("subscription_payments").insert({
    subscription_id: subscription.id,
    period_month: periodMonth,
    amount_cents: priceCents,
    due_date: periodMonth,
    grace_until: graceUntil,
    status: "waived",
  });

  if (periodError) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  await sendSafely("bevestiging vaste reservering (handmatig)", () =>
    sendSubscriptionConfirmationEmail(subscription)
  );

  return NextResponse.json(subscription);
}
