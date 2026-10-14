import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { todayStr } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { nextBillingPeriod, settle } from "@/lib/billing";
import { getActiveMemberEmails } from "@/lib/members";
import { getGraceDays } from "@/lib/paymentTerms";
import { getTariffs, type Tariffs } from "@/lib/tariffs";
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
// afgelopen periodes afrekenen + rekening mailen, herinneren, en tijdsloten vrijgeven als
// er niet binnen de vervaltermijn betaald is. Draait bewust maar 1x per dag - dat is precies
// genoeg voor dit model en past binnen de gratis Vercel Hobby-cronlimiet.
//
// Achteraf betalen (besluit bestuur, okt 2026): pas na afloop van een periode van 4 weken
// komt de rekening, voor de keren dat de band kwam (zie src/lib/billing.ts). Een opgezegde
// vaste plek krijgt nog een laatste rekening tot en met bill_until.
//
// De *_sent_at-velden worden pas gezet nadat de mail echt verstuurd is. Mislukt een mail,
// dan probeert de volgende run het gewoon opnieuw.
const DAYS_AFTER_DUE_FOR_REMINDER = 7;
const DAYS_BEFORE_GRACE_END_FOR_WARNING = 3;
// Inhalen na een storing: hooguit zoveel periodes per band per run.
const MAX_PERIODS_PER_RUN = 3;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayStr();

  const { data: billable } = await supabase
    .from("subscriptions")
    .select("*")
    .or("status.eq.active,and(status.eq.cancelled,bill_until.not.is.null)");

  const tariffs = await getTariffs();
  for (const subscription of (billable ?? []) as Subscription[]) {
    await settleFinishedPeriods(subscription, today, tariffs);
  }
  await retryUnsentInvoices();

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

async function settleFinishedPeriods(subscription: Subscription, today: string, tariffs: Tariffs) {
  const billUntil = subscription.status === "active" ? null : subscription.bill_until;

  for (let i = 0; i < MAX_PERIODS_PER_RUN; i++) {
    const { data: latest } = await supabase
      .from("subscription_payments")
      .select("period_end")
      .eq("subscription_id", subscription.id)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const period = nextBillingPeriod(subscription.start_date, latest?.period_end ?? null, billUntil);
    if (!period || today <= period.end) return; // niets meer af te rekenen, of nog bezig

    const { data: swaps } = await supabase
      .from("subscription_swaps")
      .select("original_date, new_date")
      .eq("subscription_id", subscription.id)
      .gte("original_date", period.start)
      .lte("original_date", period.end);
    const s = settle(subscription, swaps ?? [], period.start, period.end, tariffs);
    const nothingToPay = s.amountCents === 0;

    const { data: periodPayment, error } = await supabase
      .from("subscription_payments")
      .insert({
        subscription_id: subscription.id,
        period_start: period.start,
        period_end: period.end,
        amount_cents: s.amountCents,
        sessions_held: s.held,
        sessions_cancelled: s.cancelled,
        session_price_cents: s.sessionPriceCents,
        storage_cents: s.storageCents,
        due_date: today,
        grace_until: addDaysStr(today, await getGraceDays()),
        status: nothingToPay ? "waived" : "unpaid",
        admin_note: nothingToPay ? "Geen repetities in deze periode" : null,
      })
      .select()
      .single();

    // Geen rij terug = bestond al (unieke index op subscription_id + period_start).
    if (error || !periodPayment) {
      console.error(`[cron] periode ${subscription.band_name} ${period.start} niet opgeslagen:`, error);
      return;
    }
    if (!nothingToPay) await sendInvoice(subscription, periodPayment as SubscriptionPayment);
  }
}

// Rekeningen die eerder niet verstuurd konden worden: opnieuw proberen.
async function retryUnsentInvoices() {
  const { data: unsent } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .is("invoice_sent_at", null);

  for (const periodPayment of (unsent ?? []) as SubscriptionPayment[]) {
    const subscription = await getSubscription(periodPayment.subscription_id);
    if (subscription && isBillable(subscription)) await sendInvoice(subscription, periodPayment);
  }
}

// Een opgezegde vaste plek krijgt nog herinneringen voor de laatste rekening, maar vervalt
// niet meer (er is geen vaste plek meer om vrij te geven).
function isBillable(subscription: Subscription): boolean {
  return subscription.status === "active" || (subscription.status === "cancelled" && !!subscription.bill_until);
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
    if (!subscription || !isBillable(subscription)) continue;

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
