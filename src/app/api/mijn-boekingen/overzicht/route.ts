import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyMagicLinkToken } from "@/lib/magicLink";

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

  const latestPeriodBySubscription = new Map<string, CurrentPeriod>();
  for (const period of currentPeriods) {
    if (!latestPeriodBySubscription.has(period.subscription_id)) {
      latestPeriodBySubscription.set(period.subscription_id, period);
    }
  }

  const subscriptionsWithPeriod = (subscriptions ?? []).map((s) => ({
    ...s,
    currentPeriod: latestPeriodBySubscription.get(s.id) ?? null,
  }));

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
