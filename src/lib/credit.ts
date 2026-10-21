import { openCredits, sessionPriceCents } from "./billing";
import { supabase, type Subscription, type SubscriptionSwap } from "./supabase";
import { getTariffs } from "./tariffs";

// Het tegoed van een vaste plek dat nog op een volgende rekening verrekend zou worden
// (geannuleerde keren uit al gefactureerde periodes). Bij opzeggen komt er geen volgende
// rekening meer: het bestuur krijgt dit bedrag te zien en betaalt het handmatig terug.
export async function getOpenCredit(
  subscription: Subscription
): Promise<{ sessions: number; cents: number }> {
  const [{ data: swaps }, { data: payments }] = await Promise.all([
    supabase.from("subscription_swaps").select("*").eq("subscription_id", subscription.id),
    supabase
      .from("subscription_payments")
      .select("period_start, period_end, created_at, session_price_cents")
      .eq("subscription_id", subscription.id),
  ]);
  const credits = openCredits(
    (swaps ?? []) as SubscriptionSwap[],
    payments ?? [],
    sessionPriceCents(subscription, await getTariffs())
  );
  return { sessions: credits.length, cents: credits.reduce((sum, c) => sum + c.priceCents, 0) };
}
