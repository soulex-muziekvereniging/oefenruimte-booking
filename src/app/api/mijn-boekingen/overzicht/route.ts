import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { todayStr, hoursUntilSlot } from "@/lib/date";
import { addDaysStr, pickActionablePeriod } from "@/lib/periods";
import { occurrencesBetween, periodStartContaining, SubscriptionPattern } from "@/lib/schedule";

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
      "id, band_name, contact_name, contact_email, slot_date, slot_start_time, slot_end_time, price_cents, status, cancel_token"
    )
    .or(ownerFilter)
    .in("status", ["pending", "confirmed"])
    .gte("slot_date", todayStr())
    .order("slot_date", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, band_name, contact_name, weekday, dagdeel_id, frequency, start_date, price_cents, status, cancel_token"
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
  };

  const periods: Period[] =
    activeIds.length > 0
      ? ((
          await supabase
            .from("subscription_payments")
            .select("subscription_id, period_start, period_end, amount_cents, due_date, grace_until, status, pay_token")
            .in("subscription_id", activeIds)
        ).data ?? [])
      : [];
  const periodsFor = (subscriptionId: string) =>
    periods.filter((p) => p.subscription_id === subscriptionId);

  type Swap = {
    subscription_id: string;
    period_start: string;
    original_date: string;
    new_date: string;
    new_dagdeel_id: string;
  };

  const swaps: Swap[] =
    activeIds.length > 0
      ? ((await supabase.from("subscription_swaps").select("*").in("subscription_id", activeIds))
          .data ?? [])
      : [];

  const today = todayStr();
  const until = addDaysStr(today, config.subscriptionOverviewWeeks * 7);

  // De komende repetities, met per keer of die nog verplaatst kan worden: niet al
  // verplaatst, nog niet binnen de annuleringsgrens, en de band heeft in die
  // betaalperiode nog verplaatsingen over.
  function occurrencesFor(subscription: SubscriptionPattern & { id: string; status: string }) {
    if (subscription.status !== "active") return [];
    const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);
    const startTime = `${(dagdeel?.startHour ?? 0).toString().padStart(2, "0")}:00`;
    const ownPeriods = periodsFor(subscription.id);
    const ownSwaps = swaps.filter((s) => s.subscription_id === subscription.id);

    return occurrencesBetween(subscription, today, until)
      .filter((date) => hoursUntilSlot(date, startTime) > 0)
      .map((date) => {
        const swap = ownSwaps.find((s) => s.original_date === date);
        const periodStart = periodStartContaining(subscription.start_date, ownPeriods, date);
        const swapsUsed = ownSwaps.filter((s) => s.period_start === periodStart).length;
        return {
          date,
          swappedTo: swap ? { date: swap.new_date, dagdeelId: swap.new_dagdeel_id } : null,
          canSwap:
            !swap &&
            swapsUsed < config.subscriptionMaxSwapsPerPeriod &&
            hoursUntilSlot(date, startTime) >= config.cancellationCutoffHours,
        };
      });
  }

  const subscriptionsWithPeriod = (subscriptions ?? []).map((s) => ({
    ...s,
    currentPeriod: pickActionablePeriod(periodsFor(s.id), today),
    occurrences: occurrencesFor(s as SubscriptionPattern & { id: string; status: string }),
    swapsAllowed: config.subscriptionMaxSwapsPerPeriod,
  }));

  return NextResponse.json({
    bookings: bookings ?? [],
    subscriptions: subscriptionsWithPeriod,
    bandName,
    bandMembers,
  });
}
