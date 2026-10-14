import { config } from "@/config";
import { slotStartInstant, todayStr } from "./date";
import { addDaysStr } from "./periods";
import { occursOn, occurrencesBetween, periodEndFor, type SubscriptionPattern } from "./schedule";
import type { Tariffs } from "./tariffDefaults";

// Achteraf betalen voor een vaste plek (besluit bestuur, okt 2026): na afloop van elke
// periode van 4 weken rekent de band af voor de keren dat ze kwamen.
// - Gehouden = de keren in de periode min de geannuleerde keren. Een verzette keer telt als
//   gehouden (in de periode van de oorspronkelijke datum).
// - Geannuleerd = een rij in subscription_swaps zonder nieuwe datum: door de band binnen de
//   afmeldtermijn, of door het beheer vrijgegeven (by_admin). Beide hoeven niet betaald.
// - Opslagruimte: altijd het volle bedrag per periode.

type Billable = SubscriptionPattern & { price_cents: number; storage_unit: string | null };
type SwapLike = { original_date: string; new_date: string | null };

// Prijs per keer, afgeleid van het bedrag per 4 weken van deze band (price_cents is
// inclusief opslag). Zo betaalt een band die elke keer komt precies wat ze altijd betaalde.
export function sessionPriceCents(sub: Billable, tariffs: Tariffs): number {
  const base = Math.max(0, sub.price_cents - storagePriceCents(sub, tariffs));
  return Math.round(base / config.subscriptionPricing[sub.frequency].sessionsPerPeriod);
}

export function storagePriceCents(sub: Pick<Billable, "storage_unit">, tariffs: Tariffs): number {
  return sub.storage_unit ? tariffs.storageCents : 0;
}

export type Settlement = {
  held: number;
  cancelled: number;
  sessionPriceCents: number;
  storageCents: number;
  amountCents: number;
};

// De afrekening van de repetities van from t/m to (inclusief).
export function settle(
  sub: Billable,
  swaps: SwapLike[],
  from: string,
  to: string,
  tariffs: Tariffs
): Settlement {
  const dates = occurrencesBetween({ ...sub, active_until: null }, from, to);
  const cancelledDates = new Set(swaps.filter((s) => !s.new_date).map((s) => s.original_date));
  const cancelled = dates.filter((d) => cancelledDates.has(d)).length;
  const held = dates.length - cancelled;
  const price = sessionPriceCents(sub, tariffs);
  const storage = storagePriceCents(sub, tariffs);
  return {
    held,
    cancelled,
    sessionPriceCents: price,
    storageCents: storage,
    amountCents: held * price + storage,
  };
}

// De volgende periode die nog afgerekend moet worden: aansluitend op de laatste bekende
// periode (of vanaf de startdatum). Bij een opgezegde vaste plek tot en met bill_until; null
// als er niets meer af te rekenen valt.
export function nextBillingPeriod(
  startDate: string,
  latestPeriodEnd: string | null,
  billUntil: string | null
): { start: string; end: string } | null {
  const start = latestPeriodEnd ? addDaysStr(latestPeriodEnd, 1) : startDate;
  if (billUntil && start > billUntil) return null;
  const full = periodEndFor(start);
  return { start, end: billUntil && billUntil < full ? billUntil : full };
}

// Bij opzeggen: de laatste dag die nog afgerekend wordt. Vandaag telt mee als de repetitie
// van vandaag al begonnen is, anders tot en met gisteren.
export function billUntilAtCancel(sub: SubscriptionPattern): string {
  const today = todayStr();
  const dagdeel = config.dagdelen.find((d) => d.id === sub.dagdeel_id);
  const start = `${String(dagdeel?.startHour ?? 0).padStart(2, "0")}:00`;
  const startedToday = occursOn(sub, today) && slotStartInstant(today, start).getTime() <= Date.now();
  return startedToday ? today : addDaysStr(today, -1);
}
