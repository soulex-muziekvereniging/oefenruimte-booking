import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { SubscriptionPayment } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

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
