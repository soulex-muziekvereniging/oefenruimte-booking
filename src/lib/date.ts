// Gebruik getFullYear/getMonth/getDate (lokale tijd) i.p.v. toISOString() om een
// datum-string te maken. toISOString() rekent om naar UTC, wat de datum een dag kan
// laten verschuiven zodra dit draait in een tijdzone vóór UTC (bijv. Europe/Amsterdam).
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Uren tussen nu en het begin van een slot. Rekent de slotdatum/-tijd als lokale
// (Nederlandse) tijd; een eventuele afwijking van 1-2 uur door zomer-/wintertijd is
// verwaarloosbaar voor een cutoff-venster van 48 uur.
export function hoursUntilSlot(slotDate: string, slotStartTime: string): number {
  const slotStart = new Date(`${slotDate}T${slotStartTime}`);
  return (slotStart.getTime() - Date.now()) / (1000 * 60 * 60);
}
