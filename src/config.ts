export const config = {
  roomName: "Oefenruimte",
  pricePerSlotCents: 4000, // €40,- losse huur van een dagdeel
  slotDurationMinutes: 240, // elk dagdeel duurt 4 uur
  dagdelen: [
    { id: "ochtend", label: "Ochtend", startHour: 9 },
    { id: "middag", label: "Middag", startHour: 14 },
    { id: "avond", label: "Avond", startHour: 19 },
  ],
  operatingDays: [0, 1, 2, 3, 4, 5, 6] as number[],
  maxWeeksAhead: 4,
  // Vaste (structureel terugkerende) reservering van hetzelfde weekdag+dagdeel, maandelijks
  // geïncasseerd via Mollie. Zie BESTUUR.md voor de uitleg van dit model.
  subscriptionPricing: {
    weekly: { label: "Wekelijks", priceCentsPerMonth: 11000 },
    biweekly: { label: "Tweewekelijks", priceCentsPerMonth: 5500 },
  },
  // Echte mailbox (aangemaakt door Kimberly, sep 2026) - zowel het adres waar
  // boekingsnotificaties naartoe gaan als het afzenderadres van alle systeemmails.
  organizationEmail: "beheer@soulex.nl",
  senderEmail: "beheer@soulex.nl",
  organizationName: "Muziekvereniging Soulex",
  currency: "EUR" as const,
  pendingExpiryMinutes: 15,
  cancellationCutoffHours: 48,
  // Aantal dagen na de betaaldatum dat een band nog mag betalen voordat het recht op
  // het vaste tijdslot voor de rest van het jaar vervalt. Besluit bestuur 2026-09-11.
  subscriptionGraceDays: 14,
  // Hoe vaak een band per (kalendermaand-)periode een repetitie mag verplaatsen naar een
  // ander vrij dagdeel. Besluit bestuur 2026-09-11.
  subscriptionMaxSwapsPerPeriod: 2,
};

export type Config = typeof config;
