const TIME_ZONE = "Europe/Amsterdam";

// Gebruik getFullYear/getMonth/getDate (lokale tijd) i.p.v. toISOString() om een
// datum-string te maken. toISOString() rekent om naar UTC, wat de datum een dag kan
// laten verschuiven zodra dit draait in een tijdzone vóór UTC (bijv. Europe/Amsterdam).
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "Nu" als Nederlandse wandkloktijd, in de lokale velden van een Date. Nodig op de
// server: Vercel draait in UTC, dus new Date().getDate() geeft tussen 00:00 en 02:00
// Nederlandse tijd nog de vorige dag. In de browser (NL) verandert dit niets.
export function nowInAmsterdam(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
}

export function todayStr(): string {
  return toLocalDateStr(nowInAmsterdam());
}

function amsterdamOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// Het echte tijdstip waarop een slot begint (slotdatum/-tijd zijn Nederlandse tijd),
// onafhankelijk van de tijdzone waarin deze code draait.
export function slotStartInstant(slotDate: string, slotStartTime: string): Date {
  const [y, m, d] = slotDate.split("-").map(Number);
  const [hh, mm] = slotStartTime.split(":").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offset = amsterdamOffsetMinutes(new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60000);
}

export function hoursUntilSlot(slotDate: string, slotStartTime: string): number {
  return (slotStartInstant(slotDate, slotStartTime).getTime() - Date.now()) / (1000 * 60 * 60);
}
