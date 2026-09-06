export const config = {
  roomName: "Oefenruimte",
  pricePerSlotCents: 2000,
  slotDurationMinutes: 120,
  operatingHours: { start: 10, end: 22 },
  operatingDays: [0, 1, 2, 3, 4, 5, 6] as number[],
  maxWeeksAhead: 4,
  organizationEmail: "info@stichting.nl",
  organizationName: "Muziekstichting",
  currency: "EUR" as const,
  pendingExpiryMinutes: 15,
};

export type Config = typeof config;
