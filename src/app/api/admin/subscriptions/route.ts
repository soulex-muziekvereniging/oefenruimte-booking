import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import type { SubscriptionPayment } from "@/lib/supabase";
import { config } from "@/config";
import { addDaysStr, pickActionablePeriod } from "@/lib/periods";
import { todayStr } from "@/lib/date";
import { findSubscriptionConflict } from "@/lib/slots";
import { periodEndFor, weekdayOf } from "@/lib/schedule";
import { checkStartDate, conflictMessage, parseSubscriptionInput } from "@/lib/subscriptionRequest";
import { sendSubscriptionConfirmationEmail, sendSafely } from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
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
  // de betaalstatus (en kwijtschelden/coulance) op de juiste periode toont.
  const { data: payments } = await supabase.from("subscription_payments").select("*");

  const paymentsBySubscription = new Map<string, SubscriptionPayment[]>();
  for (const payment of (payments ?? []) as SubscriptionPayment[]) {
    const list = paymentsBySubscription.get(payment.subscription_id) ?? [];
    list.push(payment);
    paymentsBySubscription.set(payment.subscription_id, list);
  }

  const today = todayStr();
  const withPeriod = data.map((subscription) => ({
    ...subscription,
    currentPeriod: pickActionablePeriod(
      paymentsBySubscription.get(subscription.id) ?? [],
      today
    ),
  }));

  return NextResponse.json(withPeriod);
}

// Handmatig een vaste reservering toevoegen (bv. een bestaande afspraak van vóór dit
// systeem overzetten) - komt direct als "active" binnen, geen eerste Mollie-betaling
// nodig. De eerste periode van 4 weken wordt kwijtgescholden (die is buiten het systeem
// al geregeld); daarna loopt het mee met de normale betaalcyclus (zie /api/cron/subscriptions).
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

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
  const startError = checkStartDate(parsed.value, { admin: true });
  if (startError) {
    return NextResponse.json({ error: startError }, { status: 400 });
  }

  const conflict = await findSubscriptionConflict({
    dagdeel_id: dagdeelId,
    frequency,
    start_date: startDate,
  });
  if (conflict) {
    return NextResponse.json({ error: conflictMessage(conflict, { admin: true }) }, { status: 409 });
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
      status: "active",
      term_start_date: startDate,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  const { error: periodError } = await supabase.from("subscription_payments").insert({
    subscription_id: subscription.id,
    period_start: startDate,
    period_end: periodEndFor(startDate),
    amount_cents: priceCents,
    due_date: startDate,
    grace_until: addDaysStr(startDate, config.subscriptionGraceDays),
    status: "waived",
  });

  if (periodError) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  await sendSafely("bevestiging vaste reservering (handmatig)", () =>
    sendSubscriptionConfirmationEmail(subscription, bandEmails)
  );

  return NextResponse.json(subscription);
}
