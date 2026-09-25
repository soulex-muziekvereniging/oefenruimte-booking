export const config = {
  roomName: "Soulex Oefenruimte",
  pricePerSlotCents: 4000, // €40,- losse huur van een dagdeel
  slotDurationMinutes: 240, // elk dagdeel duurt 4 uur
  dagdelen: [
    { id: "ochtend", label: "Ochtend", startHour: 9 },
    { id: "middag", label: "Middag", startHour: 14 },
    { id: "avond", label: "Avond", startHour: 19 },
  ],
  operatingDays: [0, 1, 2, 3, 4, 5, 6] as number[],
  maxWeeksAhead: 4,
  // Vaste reservering: hetzelfde dagdeel elke week of om de week, vanaf een zelfgekozen
  // startdatum. Betalen per periode van periodWeeks weken (dus altijd evenveel keer per
  // rekening), zonder automatische incasso. Tarief: €30 per keer. Besluit bestuur volgt.
  periodWeeks: 4,
  subscriptionPricing: {
    weekly: { label: "Elke week", sessionsPerPeriod: 4, priceCentsPerPeriod: 12000 },
    biweekly: { label: "Om de week", sessionsPerPeriod: 2, priceCentsPerPeriod: 6000 },
  },
  // Opslagruimtes die bands kunnen bijhuren bij een vaste reservering (ruimte 1 en 5 zijn
  // van Soulex zelf). Prijs per betaalperiode van 4 weken, komt op dezelfde rekening.
  storage: {
    units: ["2", "3", "4"] as string[],
    priceCentsPerPeriod: 1500,
  },
  // Echte mailbox (aangemaakt door Kimberly, sep 2026) - het afzenderadres van alle
  // systeemmails en het adres dat in "neem contact op"-teksten getoond wordt.
  organizationEmail: "beheer@soulex.nl",
  senderEmail: "beheer@soulex.nl",
  // Wie meldingen krijgt (nieuwe boekingen e.d.) stel je in via het beheerpaneel, tab
  // "Instellingen". Is die lijst leeg, dan gaat alles naar organizationEmail.
  organizationName: "Muziekvereniging Soulex",
  currency: "EUR" as const,
  pendingExpiryMinutes: 15,
  cancellationCutoffHours: 48,
  // Aantal dagen na de betaaldatum dat een band nog mag betalen voordat het recht op
  // het vaste tijdslot voor de rest van het jaar vervalt. Besluit bestuur 2026-09-11.
  subscriptionGraceDays: 14,
  // Verplaatsen van een repetitie van een vaste reservering (feedback bestuur, sep 2026):
  // max. zoveel keer per betaalperiode, naar elk vrij dagdeel vanaf nu tot zoveel dagen na
  // de oorspronkelijke datum. Meer nodig? Dan mailt de band het bestuur.
  subscriptionMaxSwapsPerPeriod: 2,
  subscriptionSwapMaxDaysLater: 14,
  // Hoeveel weken vooruit "Mijn boekingen" de komende repetities toont.
  subscriptionOverviewWeeks: 8,
};

export type Config = typeof config;
