import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { todayStr } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { buildInvoice, invoiceDue, nextBillingPeriod, openCredits, sessionPriceCents } from "@/lib/billing";
import { getActiveMemberEmails } from "@/lib/members";
import { getGraceDays } from "@/lib/paymentTerms";
import { getTariffs, type Tariffs } from "@/lib/tariffs";
import { getInvoicing } from "@/lib/invoicing";
import { saveMailRun, type MailKind, type MailLogEntry } from "@/lib/mailLog";
import {
  sendPeriodPaymentRequestEmail,
  sendPeriodReminderEmail,
  sendPeriodGraceWarningEmail,
  sendPeriodLapsedEmail,
  sendPeriodLapsedNotificationToOrg,
  sendSafely,
} from "@/lib/email";
import type { Subscription, SubscriptionPayment, SubscriptionSwap } from "@/lib/supabase";

// Eén dagelijkse huishoudtaak voor vaste reserveringen (Vercel Cron, zie vercel.json):
// rekeningen klaarzetten + mailen, herinneren, en tijdsloten vrijgeven als er niet binnen de
// vervaltermijn betaald is. Draait bewust maar 1x per dag - dat is precies genoeg voor dit
// model en past binnen de gratis Vercel Hobby-cronlimiet.
//
// Vooraf betalen met verrekening (besluit bestuur, 21 okt 2026): de rekening voor een
// periode van 4 weken gaat een week voor de periode uit. Keren die geannuleerd zijn nadat
// hun periode al gefactureerd was, worden op de volgende rekening gekort (src/lib/billing.ts).
//
// De *_sent_at-velden worden pas gezet nadat de mail echt verstuurd is. Mislukt een mail,
// dan probeert de volgende run het gewoon opnieuw.
// Herinnering 7 dagen na de rekening, laatste waarschuwing 7 dagen voor het einde van de
// vervaltermijn (bij 21 dagen: mails op dag 7 en 14, vervallen na dag 21). Is de termijn zo
// kort dat beide op dezelfde dag zouden vallen, dan gaat alleen de waarschuwing.
const DAYS_AFTER_DUE_FOR_REMINDER = 7;
const DAYS_BEFORE_GRACE_END_FOR_WARNING = 7;
// Inhalen na een storing: hooguit zoveel periodes per band per run.
const MAX_PERIODS_PER_RUN = 3;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayStr();

  // Schakelaar in beheer > Instellingen: zolang die uit staat, gaat er niets naar de bands.
  const invoicing = await getInvoicing();
  if (!invoicing.enabled || !invoicing.fromDate) {
    await saveMailRun({ at: new Date().toISOString(), skipped: "rekeningen staan uit" }, []);
    return NextResponse.json({ ok: true, skipped: "rekeningen staan uit" });
  }

  const { data: active } = await supabase.from("subscriptions").select("*").eq("status", "active");

  // Elke mail aan een band komt in de verzendlog (tab Betalingen).
  const log: MailLogEntry[] = [];
  const tariffs = await getTariffs();
  for (const subscription of (active ?? []) as Subscription[]) {
    await invoiceUpcomingPeriods(subscription, today, tariffs, invoicing.fromDate, log);
  }
  await retryUnsentInvoices(log);

  await sendReminders(today, log);
  await sendGraceWarnings(today, log);
  await applyLapses(today, log);

  await saveMailRun({ at: new Date().toISOString() }, log);
  return NextResponse.json({
    ok: true,
    sent: log.filter((e) => e.ok).length,
    failed: log.filter((e) => !e.ok).length,
  });
}

// Mail aan een band versturen en vastleggen in de verzendlog. Ontvangers zoals in
// src/lib/email.ts: de contactpersoon plus alle actieve bandleden.
async function trySend(
  log: MailLogEntry[],
  kind: MailKind,
  subscription: Subscription,
  periodPayment: SubscriptionPayment,
  bandEmails: string[],
  fn: () => Promise<unknown>
): Promise<boolean> {
  const entry: MailLogEntry = {
    at: new Date().toISOString(),
    kind,
    band: subscription.band_name,
    period: `${periodPayment.period_start} t/m ${periodPayment.period_end}`,
    to: Array.from(new Set([subscription.contact_email, ...bandEmails])),
    ok: true,
  };
  try {
    await fn();
    log.push(entry);
    return true;
  } catch (err) {
    console.error(`[cron] ${kind} ${subscription.band_name} mislukt:`, err);
    log.push({ ...entry, ok: false, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

async function invoiceUpcomingPeriods(
  subscription: Subscription,
  today: string,
  tariffs: Tariffs,
  fromDate: string,
  log: MailLogEntry[]
) {
  for (let i = 0; i < MAX_PERIODS_PER_RUN; i++) {
    const { data: payments } = await supabase
      .from("subscription_payments")
      .select("period_start, period_end, created_at, session_price_cents")
      .eq("subscription_id", subscription.id)
      .order("period_start", { ascending: true });
    const latestEnd = payments?.length ? payments[payments.length - 1].period_end : null;

    const period = nextBillingPeriod(subscription.start_date, latestEnd);

    // Periode van vóór de start van de facturatie: zonder rekening of mail vastleggen, zodat
    // de volgende periode aansluit.
    if (period.start < fromDate) {
      if (period.start > today) return; // komt later vanzelf aan de beurt
      await supabase.from("subscription_payments").insert({
        subscription_id: subscription.id,
        period_start: period.start,
        period_end: period.end,
        amount_cents: 0,
        due_date: today,
        grace_until: today,
        status: "waived",
        admin_note: `Voor de start van de facturatie (vanaf ${fromDate})`,
      });
      continue;
    }

    if (!invoiceDue(period.start, today)) return; // nog te vroeg

    const { data: swaps } = await supabase
      .from("subscription_swaps")
      .select("*")
      .eq("subscription_id", subscription.id);
    const allSwaps = (swaps ?? []) as SubscriptionSwap[];
    const inPeriod = allSwaps.filter((w) => w.original_date >= period.start && w.original_date <= period.end);
    const credits = openCredits(allSwaps, payments ?? [], sessionPriceCents(subscription, tariffs));
    const inv = buildInvoice(subscription, inPeriod, period.start, period.end, tariffs, credits);
    const nothingToPay = inv.amountCents === 0;

    const { data: periodPayment, error } = await supabase
      .from("subscription_payments")
      .insert({
        subscription_id: subscription.id,
        period_start: period.start,
        period_end: period.end,
        amount_cents: inv.amountCents,
        sessions_held: inv.held,
        sessions_cancelled: inv.cancelled,
        session_price_cents: inv.sessionPriceCents,
        storage_cents: inv.storageCents,
        credit_sessions: inv.credits.length,
        credit_cents: inv.creditCents,
        due_date: today,
        grace_until: addDaysStr(today, await getGraceDays()),
        status: nothingToPay ? "waived" : "unpaid",
        admin_note: nothingToPay ? "Niets te betalen in deze periode (alles geannuleerd of verrekend)" : null,
      })
      .select()
      .single();

    // Geen rij terug = bestond al (unieke index op subscription_id + period_start).
    if (error || !periodPayment) {
      console.error(`[cron] periode ${subscription.band_name} ${period.start} niet opgeslagen:`, error);
      return;
    }
    if (inv.credits.length > 0) {
      await supabase
        .from("subscription_swaps")
        .update({ credited_in: periodPayment.id })
        .in("id", inv.credits.map((c) => c.swapId));
    }
    if (!nothingToPay) await sendInvoice(subscription, periodPayment as SubscriptionPayment, log);
  }
}

// Rekeningen die eerder niet verstuurd konden worden: opnieuw proberen.
async function retryUnsentInvoices(log: MailLogEntry[]) {
  const { data: unsent } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .is("invoice_sent_at", null);

  for (const periodPayment of (unsent ?? []) as SubscriptionPayment[]) {
    const subscription = await getSubscription(periodPayment.subscription_id);
    // Net in deze run al geprobeerd (en mislukt)? Dan morgen pas weer.
    const period = `${periodPayment.period_start} t/m ${periodPayment.period_end}`;
    if (log.some((e) => e.kind === "rekening" && e.band === subscription?.band_name && e.period === period)) {
      continue;
    }
    if (subscription?.status === "active") await sendInvoice(subscription, periodPayment, log);
  }
}

async function sendInvoice(subscription: Subscription, periodPayment: SubscriptionPayment, log: MailLogEntry[]) {
  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  const sent = await trySend(log, "rekening", subscription, periodPayment, bandEmails, () =>
    sendPeriodPaymentRequestEmail(subscription, periodPayment, bandEmails)
  );
  if (sent) {
    await supabase
      .from("subscription_payments")
      .update({ invoice_sent_at: new Date().toISOString() })
      .eq("id", periodPayment.id);
  }
}

async function sendReminders(today: string, log: MailLogEntry[]) {
  const { data: dueForReminder } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "unpaid")
    .is("reminder_sent_at", null)
    .lte("due_date", addDaysStr(today, -DAYS_AFTER_DUE_FOR_REMINDER))
    .gt("grace_until", addDaysStr(today, DAYS_BEFORE_GRACE_END_FOR_WARNING));

  for (const periodPayment of (dueForReminder ?? []) as SubscriptionPayment[]) {
    const subscription = await getSubscription(periodPayment.subscription_id);
    if (!subscription || subscription.status !== "active") continue;

    const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
    const sent = await trySend(log, "herinnering", subscription, periodPayment, bandEmails, () =>
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

async function sendGraceWarnings(today: string, log: MailLogEntry[]) {
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
    const sent = await trySend(log, "waarschuwing", subscription, periodPayment, bandEmails, () =>
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

async function applyLapses(today: string, log: MailLogEntry[]) {
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
    await trySend(log, "vervallen", lapsed, periodPayment, bandEmails, () =>
      sendPeriodLapsedEmail(lapsed, bandEmails)
    );
    await sendSafely("melding vervallen bestuur", () => sendPeriodLapsedNotificationToOrg(lapsed));
  }
}

async function getSubscription(id: string): Promise<Subscription | null> {
  const { data } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
  return data;
}
