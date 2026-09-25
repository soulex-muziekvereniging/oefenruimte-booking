import { config } from "@/config";
import { addDaysStr } from "./periods";

// Het ritme van een vaste reservering: vanaf start_date elke week, of om de week.
// "Om de week" rekent vanaf de eigen startdatum van de band (niet vanaf weeknummers - die
// verspringen bij een jaar met 53 weken). Zo kunnen twee bands hetzelfde dagdeel om en om
// delen: hun startdata liggen dan een oneven aantal weken uit elkaar.

export type Frequency = "weekly" | "biweekly";

export type SubscriptionPattern = {
  weekday: number;
  dagdeel_id: string;
  frequency: Frequency;
  start_date: string;
  // Opgezegd maar de betaalde periode loopt nog: tot en met deze dag.
  active_until?: string | null;
};

export function intervalDays(frequency: Frequency): number {
  return frequency === "biweekly" ? 14 : 7;
}

function daysBetween(from: string, to: string): number {
  // Rekenen in UTC-middag voorkomt afrondingsfouten rond de zomertijdwissel.
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function occursOn(pattern: SubscriptionPattern, date: string): boolean {
  if (date < pattern.start_date) return false;
  if (pattern.active_until && date > pattern.active_until) return false;
  return daysBetween(pattern.start_date, date) % intervalDays(pattern.frequency) === 0;
}

// Alle data van dit ritme tussen from en to (inclusief).
export function occurrencesBetween(pattern: SubscriptionPattern, from: string, to: string): string[] {
  const step = intervalDays(pattern.frequency);
  let date = pattern.start_date;
  if (date < from) {
    const behind = daysBetween(date, from);
    date = addDaysStr(date, Math.ceil(behind / step) * step);
  }
  const dates: string[] = [];
  while (date <= to && (!pattern.active_until || date <= pattern.active_until)) {
    dates.push(date);
    date = addDaysStr(date, step);
  }
  return dates;
}

// Botsen twee ritmes ooit op dezelfde dag? Alleen twee keer "om de week" met een oneven
// aantal weken verschil in startdatum kan naast elkaar bestaan.
export function patternsCollide(a: SubscriptionPattern, b: SubscriptionPattern): boolean {
  if (a.weekday !== b.weekday || a.dagdeel_id !== b.dagdeel_id) return false;
  if (a.frequency === "biweekly" && b.frequency === "biweekly") {
    const diff = Math.abs(daysBetween(a.start_date, b.start_date));
    if (diff % 14 !== 0) return false;
  }
  // Ritme a is afgelopen voordat b begint (of andersom)?
  if (a.active_until && a.active_until < b.start_date) return false;
  if (b.active_until && b.active_until < a.start_date) return false;
  return true;
}

// --- Betaalperiodes: steeds periodWeeks weken, aansluitend vanaf de startdatum ---

export const PERIOD_DAYS = config.periodWeeks * 7;

export function periodEndFor(periodStart: string): string {
  return addDaysStr(periodStart, PERIOD_DAYS - 1);
}

// In welke betaalperiode valt deze datum? Eerst de bestaande periodes (de oudste
// reserveringen hebben nog kalendermaanden), anders doorrekenen in blokken van 4 weken
// vanaf de laatste bekende periode (of de startdatum).
export function periodStartContaining(
  startDate: string,
  periods: { period_start: string; period_end: string }[],
  date: string
): string {
  const known = periods.find((p) => p.period_start <= date && date <= p.period_end);
  if (known) return known.period_start;
  const last = [...periods].sort((a, b) => a.period_end.localeCompare(b.period_end)).at(-1);
  const base = last && last.period_end < date ? addDaysStr(last.period_end, 1) : startDate;
  const offset = Math.max(0, daysBetween(base, date));
  return addDaysStr(base, Math.floor(offset / PERIOD_DAYS) * PERIOD_DAYS);
}

export function formatRhythm(pattern: Pick<SubscriptionPattern, "weekday" | "dagdeel_id" | "frequency">): string {
  const day = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"][
    pattern.weekday
  ];
  const dagdeel =
    config.dagdelen.find((d) => d.id === pattern.dagdeel_id)?.label.toLowerCase() ??
    pattern.dagdeel_id;
  return pattern.frequency === "biweekly"
    ? `om de week op ${day}${dagdeel}`
    : `elke ${day}${dagdeel}`;
}
