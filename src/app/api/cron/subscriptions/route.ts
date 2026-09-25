import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { todayStr } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { periodEndFor } from "@/lib/schedule";
import { getActiveMemberEmails } from "@/lib/members";
import {
  sendPeriodPaymentRequestEmail,
  sendPeriodReminderEmail,
  sendPeriodGraceWarningEmail,
  sendPeriodLapsedEmail,
  sendPeriodLapsedNotificationToOrg,
  sendSafely,
} from "@/lib/email";
import type { Subscription, SubscriptionPayment } from "@/lib/supabase";

// Eén dagelijkse huishoudtaak voor vaste reserveringen (Vercel Cron, zie vercel.json):
// nieuwe periodes klaarzetten + betaalverzoek mailen, herinneren, en tijdsloten vrijgeven
// als er niet binnen de coulanceperiode betaald is. Draait bewust maar 1x per dag - dat
// is precies genoeg voor dit model en past binnen de gratis Vercel Hobby-cronlimiet.
//
// De *_sent_at-velden worden pas gezet nadat de mail echt verstuurd is. Mislukt een mail,
// dan probeert de volgende run het gewoon opnieuw.
// Periodes duren 4 weken en de coulance 14 dagen: met 10 dagen vooruit factureren komt
// het volgende betaalverzoek pas nadat de coulance van de vorige periode voorbij is.
const DAYS_BEFORE_DUE_TO_INVOICE = 10;
const DAYS_AFTER_DUE_FOR_REMINDER = 7;
const DAYS_BEFORE_GRACE_END_FOR_WARNING = 3;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayStr();

  const { data: activeSubscriptions } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("status", "active");

  for (const subscription of (activeSubscriptions ?? []) as Subscription[]) {
    await ensureNextPeriod(subscription, today);
  }

  await sendReminders(today);
  await sendGraceWarnings(today);
  await applyLapses(today);

  return NextResponse.json({ ok: true });
}

async function trySend(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[cron] ${label} mislukt:`, err);
    return false;
  }
}

async function ensureNextPeriod(subscription: Subscription, today: string) {
  const { data: latest } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("subscription_id", subscription.id)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return; // zou niet moeten gebeuren - elke actieve subscription heeft een eerste periode

  // Betaalverzoek dat eerder niet verstuurd kon worden: opnieuw proberen.
  if (latest.status === "unpaid" && !latest.invoice_sent_at) {
    await sendInvoice(subscription, latest as SubscriptionPayment);
  }

  // Nooit een nieuwe periode klaarzetten zolang de vorige nog openstaat - die wordt óf
  // alsnog betaald, óf de reservering vervalt na de coulance.
  if (latest.status === "unpaid") return;

  const nextStart = addDaysStr(latest.period_end, 1);
  if (today < addDaysStr(nextStart, -DAYS_BEFORE_DUE_TO_INVOICE)) return; // nog te vroeg

  const { data: periodPayment } = await supabase
    .from("subscription_payments")
    .insert({
      subscription_id: subscription.id,
      period_start: nextStart,
      period_end: periodEndFor(nextStart),
      amount_cents: subscription.price_cents,
      due_date: nextStart,
      grace_until: addDaysStr(nextStart, config.subscriptionGraceDays),
      status: "unpaid",
    })
    .select()
    .single();

  // Geen rij terug = bestond al (unieke index op subscription_id + period_start).
  if (!periodPayment) return;

  await sendInvoice(subscription, periodPayment as SubscriptionPayment);
}

async function sendInvoice(subscription: Subscription, periodPayment: SubscriptionPayment) {
  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  const sent = await trySend(`betaalverzoek ${subscription.band_name} ${periodPayment.period_start}`, () =>
    sendPeriodPaymentRequestEmail(subscription, periodPayment, bandEmails)
  );
  if (sent) {
    await supabase
      .from("subscription_payments")
      .update({ invoice_sent_at: new Date().toISOString() })
      .eq("id", periodPayment.id);
  }
}

async function sendReminders(today: string) {
  const { data: dueForReminder } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .is("reminder_sent_at", null)
    .lte("due_date", addDaysStr(today, -DAYS_AFTER_DUE_FOR_REMINDER));

  for (const periodPayment of (dueForReminder ?? []) as SubscriptionPayment[]) {
    const subscription = await getSubscription(periodPayment.subscription_id);
    if (!subscription || subscription.status !== "active") continue;

    const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
    const sent = await trySend(`herinnering ${subscription.band_name}`, () =>
      sendPeriodReminderEmail(subscription, periodPayment, bandEmails)
    );
    if (sent) {
      await supabase
        .from("subscription_payments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", periodPayment.id);
    }
  }
}

async function sendGraceWarnings(today: string) {
  const { data: needsWarning } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .is("warning_sent_at", null)
    .lte("grace_until", addDaysStr(today, DAYS_BEFORE_GRACE_END_FOR_WARNING))
    .gte("grace_until", today);

  for (const periodPayment of (needsWarning ?? []) as SubscriptionPayment[]) {
    const subscription = await getSubscription(periodPayment.subscription_id);
    if (!subscription || subscription.status !== "active") continue;

    const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
    const sent = await trySend(`coulance-waarschuwing ${subscription.band_name}`, () =>
      sendPeriodGraceWarningEmail(subscription, periodPayment, bandEmails)
    );
    if (sent) {
      await supabase
        .from("subscription_payments")
        .update({ warning_sent_at: new Date().toISOString() })
        .eq("id", periodPayment.id);
    }
  }
}

async function applyLapses(today: string) {
  const { data: overdue } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .lt("grace_until", today);

  for (const periodPayment of (overdue ?? []) as SubscriptionPayment[]) {
    const { data: lapsed } = await supabase
      .from("subscriptions")
      .update({
        status: "lapsed",
        term_end_date: periodPayment.grace_until,
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodPayment.subscription_id)
      .eq("status", "active")
      .select()
      .maybeSingle();

    if (!lapsed) continue; // al vervallen/opgezegd door een eerdere run of admin-actie

    const bandEmails = await getActiveMemberEmails(lapsed.band_name, lapsed.contact_email);
    await sendSafely("melding vervallen", () => sendPeriodLapsedEmail(lapsed, bandEmails));
    await sendSafely("melding vervallen bestuur", () => sendPeriodLapsedNotificationToOrg(lapsed));
  }
}

async function getSubscription(id: string): Promise<Subscription | null> {
  const { data } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
  return data;
}
