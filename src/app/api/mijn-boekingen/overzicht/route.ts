import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { toLocalDateStr, todayStr, nowInAmsterdam } from "@/lib/date";
import { firstOfMonthStr, pickActionablePeriod } from "@/lib/periods";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = token ? verifyMagicLinkToken(token) : null;

  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, band_name, slot_date, slot_start_time, slot_end_time, price_cents, status, cancel_token"
    )
    .ilike("contact_email", email)
    .in("status", ["pending", "confirmed"])
    .gte("slot_date", todayStr())
    .order("slot_date", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, band_name, weekday, dagdeel_id, frequency, price_cents, status, cancel_token"
    )
    .ilike("contact_email", email)
    .in("status", ["pending_first_payment", "active", "lapsed"]);

  const activeIds = (subscriptions ?? [])
    .filter((s) => s.status === "active")
    .map((s) => s.id);

  type CurrentPeriod = {
    subscription_id: string;
    period_month: string;
    amount_cents: number;
    due_date: string;
    grace_until: string;
    status: "unpaid" | "paid" | "waived";
    pay_token: string;
  };

  const currentPeriods: CurrentPeriod[] =
    activeIds.length > 0
      ? ((
          await supabase
            .from("subscription_payments")
            .select("subscription_id, period_month, amount_cents, due_date, grace_until, status, pay_token")
            .in("subscription_id", activeIds)
            .order("period_month", { ascending: false })
        ).data ?? [])
      : [];

  const currentMonth = firstOfMonthStr(nowInAmsterdam());
  const periodsFor = (subscriptionId: string) =>
    currentPeriods.filter((p) => p.subscription_id === subscriptionId);

  // Repetities tonen we voor de lopende maand - niet voor de nieuwste periode, want de
  // cron zet de volgende maand al ~14 dagen van tevoren klaar.
  function occurrencePeriod(subscriptionId: string): CurrentPeriod | undefined {
    return periodsFor(subscriptionId)
      .filter((p) => p.period_month >= currentMonth)
      .sort((a, b) => a.period_month.localeCompare(b.period_month))[0];
  }

  type Swap = {
    subscription_id: string;
    period_month: string;
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

  type SubscriptionRow = {
    id: string;
    band_name: string;
    weekday: number;
    dagdeel_id: string;
    frequency: "weekly" | "biweekly";
    price_cents: number;
    status: string;
    cancel_token: string;
  };

  function occurrencesFor(subscription: SubscriptionRow) {
    const period = occurrencePeriod(subscription.id);
    if (!period) return { occurrences: [], swapsUsed: 0 };

    const periodMonth = period.period_month;
    const [y, m] = periodMonth.split("-").map(Number);
    const monthEnd = new Date(y, m, 0); // laatste dag van de maand
    const start = new Date(Math.max(new Date(periodMonth + "T00:00:00").getTime(), new Date(today + "T00:00:00").getTime()));

    const dates: string[] = [];
    const d = new Date(start);
    while (d <= monthEnd) {
      if (d.getDay() === subscription.weekday) dates.push(toLocalDateStr(d));
      d.setDate(d.getDate() + 1);
    }

    const swapsThisPeriod = swaps.filter(
      (s) => s.subscription_id === subscription.id && s.period_month === periodMonth
    );
    const swapByOriginalDate = new Map(swapsThisPeriod.map((s) => [s.original_date, s]));

    const occurrences = dates.map((date) => {
      const swap = swapByOriginalDate.get(date);
      return {
        date,
        swappedTo: swap ? { date: swap.new_date, dagdeelId: swap.new_dagdeel_id } : null,
      };
    });

    return { occurrences, swapsUsed: swapsThisPeriod.length };
  }

  const subscriptionsWithPeriod = (subscriptions ?? []).map((s) => {
    const { occurrences, swapsUsed } = occurrencesFor(s);
    return {
      ...s,
      currentPeriod: pickActionablePeriod(periodsFor(s.id), currentMonth),
      occurrences,
      swapsUsed,
      swapsAllowed: config.subscriptionMaxSwapsPerPeriod,
    };
  });

  const { data: member } = await supabase
    .from("members")
    .select("name")
    .ilike("email", email)
    .eq("active", true)
    .maybeSingle();

  let bandName: string | null = null;
  let bandMembers: string[] = [];

  if (member) {
    bandName = member.name;
    const { data: sameNameMembers } = await supabase
      .from("members")
      .select("email")
      .ilike("name", member.name)
      .eq("active", true);
    bandMembers = (sameNameMembers ?? []).map((m) => m.email);
  }

  return NextResponse.json({
    bookings: bookings ?? [],
    subscriptions: subscriptionsWithPeriod,
    bandName,
    bandMembers,
  });
}
