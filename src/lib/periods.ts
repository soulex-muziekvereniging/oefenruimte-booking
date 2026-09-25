import { toLocalDateStr } from "./date";

// Betaalperiodes voor een vaste reservering lopen per 4 weken vanaf de startdatum van de
// band (zie src/lib/schedule.ts), zodat elke rekening over evenveel keer gaat.

// De periode waar actie op nodig is: de oudste nog onbetaalde, anders de lopende (waar
// vandaag in valt), anders de meest recente. Niet simpelweg de nieuwste - de cron zet de
// volgende periode al van tevoren klaar, en dan zou de lopende uit beeld raken.
export function pickActionablePeriod<
  T extends { period_start: string; period_end: string; status: string },
>(periods: T[], today: string): T | null {
  const sorted = [...periods].sort((a, b) => a.period_start.localeCompare(b.period_start));
  return (
    sorted.find((p) => p.status === "unpaid") ??
    sorted.find((p) => p.period_start <= today && today <= p.period_end) ??
    sorted[sorted.length - 1] ??
    null
  );
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}
