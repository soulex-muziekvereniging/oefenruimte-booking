import { toLocalDateStr } from "./date";

// Betaalperiodes voor een vaste reservering lopen per kalendermaand (niet per 4 weken) -
// dat sluit aan bij de al bestaande "per maand"-tarieven en is voor bands een vertrouwd
// ritme. Zie BESTUUR.md en de projectmemory "soulex-payment-model-pivot".

export function firstOfMonthStr(date: Date): string {
  return toLocalDateStr(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addMonthsToMonthStr(monthStr: string, months: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  return toLocalDateStr(new Date(y, m - 1 + months, 1));
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}
