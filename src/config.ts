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
  // TODO: bevestigen welk mailadres boekingsnotificaties moet ontvangen (info@soulex.nl of kimberly@soulex.nl)
  organizationEmail: "info@soulex.nl",
  organizationName: "Muziekvereniging Soulex",
  currency: "EUR" as const,
  pendingExpiryMinutes: 15,
  cancellationCutoffHours: 48,
  // Aantal dagen na de betaaldatum dat een band nog mag betalen voordat het recht op
  // het vaste tijdslot voor de rest van het jaar vervalt. Besluit bestuur 2026-09-11.
  subscriptionGraceDays: 14,
};

export type Config = typeof config;
