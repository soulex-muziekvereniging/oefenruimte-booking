import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { todayStr, hoursUntilSlot } from "@/lib/date";
import { addDaysStr, pickActionablePeriod } from "@/lib/periods";
import { occurrencesBetween, periodStartContaining, SubscriptionPattern } from "@/lib/schedule";
import { getPaymentTerms } from "@/lib/paymentTerms";
import { nextBillingPeriod, settle } from "@/lib/billing";
import { getTariffs } from "@/lib/tariffs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = token ? verifyMagicLinkToken(token) : null;

  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  // Eerst bepalen bij welke band dit e-mailadres hoort: het overzicht toont de boekingen
  // van de hele band, niet alleen die van dit ene adres.
  const { data: member } = await supabase
    .from("members")
    .select("name")
    .ilike("email", email)
    .eq("active", true)
    .maybeSingle();

  let bandName: string | null = null;
  let bandMembers: string[] = [email.toLowerCase()];

  if (member) {
    bandName = member.name;
    const { data: sameNameMembers } = await supabase
      .from("members")
      .select("email")
      .ilike("name", member.name)
      .eq("active", true);
    bandMembers = Array.from(
      new Set([email.toLowerCase(), ...(sameNameMembers ?? []).map((m) => m.email.toLowerCase())])
    );
  }

  const quote = (v: string) => `"${v.replace(/"/g, "")}"`;
  const ownerFilter = [
    ...bandMembers.map((e) => `contact_email.ilike.${quote(e)}`),
    ...(bandName ? [`band_name.ilike.${quote(bandName)}`] : []),
  ].join(",");

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, band_name, contact_name, contact_email, slot_date, slot_start_time, slot_end_time, price_cents, status, cancel_token, paid_by, mollie_payment_id"
    )
    .or(ownerFilter)
    .in("status", ["pending", "confirmed"])
    .gte("slot_date", todayStr())
    .order("slot_date", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, band_name, contact_name, weekday, dagdeel_id, frequency, start_date, price_cents, storage_unit, status, cancel_token"
    )
    .or(ownerFilter)
    .in("status", ["pending_first_payment", "active", "lapsed"]);

  const activeIds = (subscriptions ?? [])
    .filter((s) => s.status === "active")
    .map((s) => s.id);

  type Period = {
    subscription_id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    due_date: string;
    grace_until: string;
    status: "unpaid" | "paid" | "waived";
    pay_token: string;
    paid_at: string | null;
    paid_by: string | null;
    sessions_held: number | null;
    sessions_cancelled: number | null;
  };

  const periods: Period[] =
    activeIds.length > 0
      ? ((
          await supabase
            .from("subscription_payments")
            .select("*")
            .in("subscription_id", activeIds)
        ).data ?? [])
      : [];
  const periodsFor = (subscriptionId: string) =>
    periods.filter((p) => p.subscription_id === subscriptionId);

  type Swap = {
    subscription_id: string;
    period_start: string;
    original_date: string;
    new_date: string | null;
    new_dagdeel_id: string | null;
    by_admin?: boolean;
  };

  const swaps: Swap[] =
    activeIds.length > 0
      ? ((await supabase.from("subscription_swaps").select("*").in("subscription_id", activeIds))
          .data ?? [])
      : [];

  const today = todayStr();
  const { graceDays, cancelDays } = await getPaymentTerms();
  const tariffs = await getTariffs();
  // De kalender toont een jaar vooruit, de lijst met verplaatsknoppen alleen de eerste
  // weken.
  const until = addDaysStr(today, config.subscriptionPlanningWeeks * 7);
  const listUntil = addDaysStr(today, config.subscriptionOverviewWeeks * 7);

  // De komende repetities, met per keer of die nog verplaatst kan worden (niet al verzet of
  // geannuleerd, nog niet binnen de 48-uursgrens, binnen de lijst-periode, en de band heeft
  // in die periode nog verplaatsingen over) en of die nog geannuleerd kan worden (binnen
  // de lijst-periode, niet al verzet, en vóór de afmeldtermijn). Achteraf betalen: niets is
  // meer "onder voorbehoud van betaling", behalve bij een openstaande rekening.
  function occurrencesFor(subscription: SubscriptionPattern & { id: string; status: string }) {
    if (subscription.status !== "active") return [];
    const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);
    const startTime = `${(dagdeel?.startHour ?? 0).toString().padStart(2, "0")}:00`;
    const ownPeriods = periodsFor(subscription.id);
    const ownSwaps = swaps.filter((s) => s.subscription_id === subscription.id);
    const hasOpenBill = ownPeriods.some((p) => p.status === "unpaid");

    return occurrencesBetween(subscription, today, until)
      .filter((date) => hoursUntilSlot(date, startTime) > 0)
      .map((date) => {
        const swap = ownSwaps.find((s) => s.original_date === date);
        const periodStart = periodStartContaining(subscription.start_date, ownPeriods, date);
        const swapsUsed = ownSwaps.filter(
          (s) => s.period_start === periodStart && s.new_date && !s.by_admin
        ).length;
        return {
          date,
          swappedTo: swap ? { date: swap.new_date, dagdeelId: swap.new_dagdeel_id } : null,
          // Geannuleerd door de band (by_admin = vrijgegeven door het beheer).
          cancelledBy: swap && !swap.new_date ? (swap.by_admin ? "beheer" : "band") : null,
          provisional: hasOpenBill,
          canSwap:
            date <= listUntil &&
            !swap &&
            swapsUsed < config.subscriptionMaxSwapsPerPeriod &&
            hoursUntilSlot(date, startTime) >= config.cancellationCutoffHours,
          canCancel: date <= listUntil && !swap && hoursUntilSlot(date, startTime) >= cancelDays * 24,
        };
      });
  }

  const subscriptionsWithPeriod = (subscriptions ?? []).map((s) => ({
    ...s,
    currentPeriod: pickActionablePeriod(periodsFor(s.id), today),
    // De laatste paar periodes, zodat de band ziet of en door wie er betaald is.
    recentPeriods: periodsFor(s.id)
      .filter((p) => p.period_start <= addDaysStr(today, 14))
      .sort((a, b) => b.period_start.localeCompare(a.period_start))
      .slice(0, 3),
    occurrences: occurrencesFor(s as SubscriptionPattern & { id: string; status: string }),
    runningPeriod: s.status === "active" ? runningPeriod(s) : null,
    swapsAllowed: config.subscriptionMaxSwapsPerPeriod,
  }));

  // De lopende, nog niet afgerekende periode: tot nu toe gepland en geannuleerd, en het
  // bedrag als er niets meer verandert (de rekening komt na afloop).
  function runningPeriod(
    s: SubscriptionPattern & { id: string; price_cents: number; storage_unit: string | null }
  ) {
    const latestEnd = periodsFor(s.id).reduce<string | null>(
      (max, p) => (!max || p.period_end > max ? p.period_end : max),
      null
    );
    let period = nextBillingPeriod(s.start_date, latestEnd, null);
    // Nog een vooruitbetaalde periode bezig (overgang): de eerstvolgende tonen.
    while (period && period.end < today) {
      period = nextBillingPeriod(s.start_date, period.end, null);
    }
    if (!period) return null;
    const ownSwaps = swaps.filter((w) => w.subscription_id === s.id);
    const settlement = settle(s, ownSwaps, period.start, period.end, tariffs);
    return { period_start: period.start, period_end: period.end, ...settlement };
  }

  return NextResponse.json({
    bookings: (bookings ?? []).map(({ mollie_payment_id, ...b }) => ({
      ...b,
      paidOnline: !!mollie_payment_id,
    })),
    subscriptions: subscriptionsWithPeriod,
    listUntil,
    graceDays,
    cancelDays,
    bandName,
    bandMembers,
  });
}
