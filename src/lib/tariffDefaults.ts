import { config } from "@/config";

// Tarieven in centen. Instelbaar door beheerders (tabel settings, key "tariffs"); de
// bedragen in config.ts zijn de standaard als er nog niets is opgeslagen of de
// database even niet bereikbaar is.
export type Tariffs = {
  singleCents: number; // losse boeking per dagdeel
  weeklyCents: number; // vaste reservering elke week, per periode van 4 weken
  biweeklyCents: number; // vaste reservering om de week, per periode van 4 weken
  storageCents: number; // opslagruimte, per periode van 4 weken
};

export const TARIFF_LABELS: Record<keyof Tariffs, string> = {
  singleCents: "Losse boeking (per dagdeel)",
  weeklyCents: `Elke week (per ${config.periodWeeks} weken)`,
  biweeklyCents: `Om de week (per ${config.periodWeeks} weken)`,
  storageCents: `Opslagruimte (per ${config.periodWeeks} weken)`,
};

export function defaultTariffs(): Tariffs {
  return {
    singleCents: config.pricePerSlotCents,
    weeklyCents: config.subscriptionPricing.weekly.priceCentsPerPeriod,
    biweeklyCents: config.subscriptionPricing.biweekly.priceCentsPerPeriod,
    storageCents: config.storage.priceCentsPerPeriod,
  };
}

// Bedrag per periode van 4 weken. Een korting (procent, migratie 023) geldt alleen voor de
// repetities, de opslagruimte kost altijd het volle bedrag.
export function subscriptionPrice(
  tariffs: Tariffs,
  frequency: "weekly" | "biweekly",
  withStorage: boolean,
  discountPercent = 0
): number {
  const rehearsals = frequency === "weekly" ? tariffs.weeklyCents : tariffs.biweeklyCents;
  return (
    Math.round((rehearsals * (100 - discountPercent)) / 100) +
    (withStorage ? tariffs.storageCents : 0)
  );
}

export function parseDiscountPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
}
