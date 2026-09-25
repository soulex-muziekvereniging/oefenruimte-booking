import { config } from "@/config";
import { nowInAmsterdam, slotStartInstant, toLocalDateStr, todayStr } from "./date";
import type { Frequency } from "./schedule";
import type { SubscriptionConflict } from "./slots";

// Gedeelde invoercontrole voor een nieuwe vaste reservering (publiek formulier, beheer en
// de live beschikbaarheidscheck), zodat de regels op één plek staan.

export type SubscriptionInput = {
  startDate: string;
  dagdeelId: string;
  frequency: Frequency;
};

export function parseSubscriptionInput(
  body: Record<string, unknown>
): { ok: true; value: SubscriptionInput } | { ok: false; error: string } {
  const { startDate, dagdeelId, frequency } = body;
  if (typeof frequency !== "string" || !(frequency in config.subscriptionPricing)) {
    return { ok: false, error: "Kies elke week of om de week" };
  }
  if (typeof dagdeelId !== "string" || !config.dagdelen.some((d) => d.id === dagdeelId)) {
    return { ok: false, error: "Ongeldig dagdeel" };
  }
  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, error: "Kies een startdatum" };
  }
  return { ok: true, value: { startDate, dagdeelId, frequency: frequency as Frequency } };
}

// Bands mogen starten vanaf het eerstvolgende nog niet begonnen dagdeel, tot maxWeeksAhead
// weken vooruit. De beheerder mag verder vooruit (bestaande afspraken overzetten).
export function checkStartDate(input: SubscriptionInput, opts: { admin?: boolean } = {}): string | null {
  const dagdeel = config.dagdelen.find((d) => d.id === input.dagdeelId)!;
  const start = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;

  if (opts.admin) {
    return input.startDate < todayStr() ? "De startdatum ligt in het verleden" : null;
  }
  if (slotStartInstant(input.startDate, start).getTime() <= Date.now()) {
    return "Deze startdatum is al begonnen of voorbij";
  }
  const latest = nowInAmsterdam();
  latest.setDate(latest.getDate() + config.maxWeeksAhead * 7);
  if (input.startDate > toLocalDateStr(latest)) {
    return `De startdatum mag maximaal ${config.maxWeeksAhead} weken vooruit liggen`;
  }
  return null;
}

function formatShort(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
  });
}

export function conflictMessage(conflict: NonNullable<SubscriptionConflict>, opts: { admin?: boolean } = {}): string {
  if (conflict.kind === "subscription") {
    return conflict.freeFrom
      ? `Dit moment is nog vast gereserveerd tot en met ${formatShort(conflict.freeFrom)}. Kies een startdatum daarna, of een ander moment.`
      : "Dit moment is al vast gereserveerd door een andere band. Kies een ander dagdeel, een andere dag of (bij om de week) de andere week.";
  }
  const dates = conflict.dates.slice(0, 5).map(formatShort).join(", ");
  return opts.admin
    ? `Er staan al losse boekingen op dit moment (${dates}${conflict.dates.length > 5 ? ", ..." : ""}). Annuleer of verplaats die eerst, of kies een latere startdatum.`
    : `Op dit moment staan al losse boekingen van andere bands (${dates}${conflict.dates.length > 5 ? ", ..." : ""}). Kies een latere startdatum of een ander moment, of neem contact op met het bestuur.`;
}
