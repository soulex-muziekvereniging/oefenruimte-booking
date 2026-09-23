import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import type { SubscriptionPayment } from "@/lib/supabase";
import { config } from "@/config";
import { firstOfMonthStr, addDaysStr } from "@/lib/periods";
import { sendSubscriptionConfirmationEmail } from "@/lib/email";

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

  // Voeg de meest recente betaalperiode per reservering toe, zodat het admin-scherm de
  // betaalstatus kan tonen zonder een aparte round-trip per rij.
  const { data: payments } = await supabase
    .from("subscription_payments")
    .select("*")
    .order("period_month", { ascending: false });

  const latestPaymentBySubscription = new Map<string, SubscriptionPayment>();
  for (const payment of (payments ?? []) as SubscriptionPayment[]) {
    if (!latestPaymentBySubscription.has(payment.subscription_id)) {
      latestPaymentBySubscription.set(payment.subscription_id, payment);
    }
  }

  const withPeriod = data.map((subscription) => ({
    ...subscription,
    currentPeriod: latestPaymentBySubscription.get(subscription.id) ?? null,
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

  const priceCents =
    config.subscriptionPricing[frequency as "weekly" | "biweekly"].priceCentsPerMonth;

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

  const periodMonth = firstOfMonthStr(new Date());
  const dueDate = firstOfMonthStr(new Date());
  const graceUntil = addDaysStr(dueDate, config.subscriptionGraceDays);

  const { error: periodError } = await supabase.from("subscription_payments").insert({
    subscription_id: subscription.id,
    period_month: periodMonth,
    amount_cents: priceCents,
    due_date: dueDate,
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

  await sendSubscriptionConfirmationEmail(subscription);

  return NextResponse.json(subscription);
}
