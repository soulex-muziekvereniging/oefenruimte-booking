import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { toLocalDateStr } from "@/lib/date";
import { addDaysStr, addMonthsToMonthStr } from "@/lib/periods";
import { getActiveMemberEmails } from "@/lib/members";
import {
  sendPeriodPaymentRequestEmail,
  sendPeriodReminderEmail,
  sendPeriodGraceWarningEmail,
  sendPeriodLapsedEmail,
  sendPeriodLapsedNotificationToOrg,
} from "@/lib/email";
import type { Subscription, SubscriptionPayment } from "@/lib/supabase";

// Eén dagelijkse huishoudtaak voor vaste reserveringen (Vercel Cron, zie vercel.json):
// nieuwe periodes klaarzetten + betaalverzoek mailen, herinneren, en tijdsloten vrijgeven
// als er niet binnen de coulanceperiode betaald is. Draait bewust maar 1x per dag - dat
// is precies genoeg voor dit model en past binnen de gratis Vercel Hobby-cronlimiet.
const DAYS_BEFORE_DUE_TO_INVOICE = 14;
const DAYS_AFTER_DUE_FOR_REMINDER = 7;
const DAYS_BEFORE_GRACE_END_FOR_WARNING = 3;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = toLocalDateStr(new Date());

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

async function ensureNextPeriod(subscription: Subscription, today: string) {
  const { data: latest } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("subscription_id", subscription.id)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return; // zou niet moeten gebeuren - elke actieve subscription heeft een eerste periode

  const nextMonth = addMonthsToMonthStr(latest.period_month, 1);
  const invoiceFrom = addDaysStr(nextMonth, -DAYS_BEFORE_DUE_TO_INVOICE);
  if (today < invoiceFrom) return; // nog te vroeg om de volgende periode klaar te zetten

  const { data: existing } = await supabase
    .from("subscription_payments")
    .select("id")
    .eq("subscription_id", subscription.id)
    .eq("period_month", nextMonth)
    .maybeSingle();

  if (existing) return;

  const dueDate = nextMonth;
  const graceUntil = addDaysStr(dueDate, config.subscriptionGraceDays);

  const { data: periodPayment } = await supabase
    .from("subscription_payments")
    .insert({
      subscription_id: subscription.id,
      period_month: nextMonth,
      amount_cents: subscription.price_cents,
      due_date: dueDate,
      grace_until: graceUntil,
      status: "unpaid",
      invoice_sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (!periodPayment) return;

  const bandEmails = await getActiveMemberEmails(subscription.band_name);
  await sendPeriodPaymentRequestEmail(subscription, periodPayment, bandEmails);
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

    const bandEmails = await getActiveMemberEmails(subscription.band_name);
    await sendPeriodReminderEmail(subscription, periodPayment, bandEmails);
    await supabase
      .from("subscription_payments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", periodPayment.id);
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

    const bandEmails = await getActiveMemberEmails(subscription.band_name);
    await sendPeriodGraceWarningEmail(subscription, periodPayment, bandEmails);
    await supabase
      .from("subscription_payments")
      .update({ warning_sent_at: new Date().toISOString() })
      .eq("id", periodPayment.id);
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
      .single();

    if (!lapsed) continue; // al vervallen/opgezegd door een eerdere run of admin-actie

    const bandEmails = await getActiveMemberEmails(lapsed.band_name);
    await sendPeriodLapsedEmail(lapsed, bandEmails);
    await sendPeriodLapsedNotificationToOrg(lapsed);
  }
}

async function getSubscription(id: string): Promise<Subscription | null> {
  const { data } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
  return data;
}
