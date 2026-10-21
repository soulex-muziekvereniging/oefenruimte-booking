import { config } from "@/config";
import { addDaysStr } from "./periods";
import { occurrencesBetween, periodEndFor, type SubscriptionPattern } from "./schedule";
import type { Tariffs } from "./tariffDefaults";

// Vooraf betalen met verrekening (besluit bestuur, 21 okt 2026). De rekening voor een
// periode van 4 weken gaat config.subscriptionInvoiceDaysBefore dagen voor de periode uit:
// - alle keren in de periode, behalve de keren die op dat moment al geannuleerd zijn;
// - plus altijd de volle opslag;
// - min het tegoed: keren die geannuleerd zijn nadat hun eigen periode al gefactureerd was
//   (credited_in nog leeg). Die worden op deze rekening gekort.
// Geannuleerd = een rij in subscription_swaps zonder nieuwe datum: door de band (tot de
// afmeldtermijn) of door het beheer vrijgegeven (by_admin). Een verzette keer telt gewoon.

type Billable = SubscriptionPattern & { price_cents: number; storage_unit: string | null };
type SwapLike = { original_date: string; new_date: string | null };

// Prijs per keer, afgeleid van het bedrag per 4 weken van deze band (price_cents is
// inclusief opslag). Zo betaalt een band die elke keer komt precies het bedrag per 4 weken.
export function sessionPriceCents(sub: Billable, tariffs: Tariffs): number {
  const base = Math.max(0, sub.price_cents - storagePriceCents(sub, tariffs));
  return Math.round(base / config.subscriptionPricing[sub.frequency].sessionsPerPeriod);
}

export function storagePriceCents(sub: Pick<Billable, "storage_unit">, tariffs: Tariffs): number {
  return sub.storage_unit ? tariffs.storageCents : 0;
}

// Een geannuleerde keer uit een al gefactureerde periode, nog niet verrekend.
export type Credit = { swapId: string; date: string; priceCents: number };

export type Invoice = {
  held: number; // keren op de rekening
  cancelled: number; // keren die al vóór de rekening geannuleerd waren
  sessionPriceCents: number;
  storageCents: number;
  credits: Credit[]; // tegoed dat op deze rekening verrekend wordt
  creditCents: number;
  amountCents: number;
};

// De rekening voor de periode from t/m to. Het tegoed wordt verrekend tot het bedrag op 0
// staat; wat overblijft, schuift door naar de volgende rekening.
export function buildInvoice(
  sub: Billable,
  swapsInPeriod: SwapLike[],
  from: string,
  to: string,
  tariffs: Tariffs,
  openCredits: Credit[] = []
): Invoice {
  const dates = occurrencesBetween({ ...sub, active_until: null }, from, to);
  const cancelledDates = new Set(swapsInPeriod.filter((s) => !s.new_date).map((s) => s.original_date));
  const cancelled = dates.filter((d) => cancelledDates.has(d)).length;
  const held = dates.length - cancelled;
  const price = sessionPriceCents(sub, tariffs);
  const storage = storagePriceCents(sub, tariffs);

  let amount = held * price + storage;
  const credits: Credit[] = [];
  for (const credit of openCredits) {
    if (credit.priceCents > amount) break;
    credits.push(credit);
    amount -= credit.priceCents;
  }
  const creditCents = credits.reduce((sum, c) => sum + c.priceCents, 0);
  return {
    held,
    cancelled,
    sessionPriceCents: price,
    storageCents: storage,
    credits,
    creditCents,
    amountCents: amount,
  };
}

// Open tegoed: geannuleerde keren (zonder nieuwe datum, nog niet verrekend) uit een periode
// waarvan de rekening al gemaakt was vóórdat er geannuleerd werd. De prijs is die van de
// rekening waar de keer op stond.
export function openCredits(
  swaps: { id: string; original_date: string; new_date: string | null; created_at: string; credited_in?: string | null }[],
  payments: { period_start: string; period_end: string; created_at: string; session_price_cents: number | null }[],
  fallbackPriceCents: number
): Credit[] {
  return swaps
    .filter((s) => !s.new_date && !s.credited_in)
    .flatMap((s) => {
      const p = payments.find((x) => x.period_start <= s.original_date && s.original_date <= x.period_end);
      // Nog niet gefactureerd, of al vóór de rekening geannuleerd (dan stond hij er niet op).
      if (!p || Date.parse(s.created_at) <= Date.parse(p.created_at)) return [];
      return [{ swapId: s.id, date: s.original_date, priceCents: p.session_price_cents ?? fallbackPriceCents }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// De volgende periode die nog gefactureerd moet worden: aansluitend op de laatste bekende
// periode, of vanaf de startdatum.
export function nextBillingPeriod(
  startDate: string,
  latestPeriodEnd: string | null
): { start: string; end: string } {
  const start = latestPeriodEnd ? addDaysStr(latestPeriodEnd, 1) : startDate;
  return { start, end: periodEndFor(start) };
}

// Mag de rekening voor een periode die op periodStart begint vandaag al de deur uit?
export function invoiceDue(periodStart: string, today: string): boolean {
  return today >= addDaysStr(periodStart, -config.subscriptionInvoiceDaysBefore);
}
