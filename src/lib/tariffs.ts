import { supabase } from "./supabase";
import { defaultTariffs, TARIFF_LABELS, type Tariffs } from "./tariffDefaults";

export { defaultTariffs, subscriptionPrice, TARIFF_LABELS, type Tariffs } from "./tariffDefaults";

// Grenzen tegen tikfouten (€1 tot €1.000).
const MIN_CENTS = 100;
const MAX_CENTS = 100_000;

export async function getTariffs(): Promise<Tariffs> {
  const defaults = defaultTariffs();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "tariffs")
    .maybeSingle();
  if (error || !data) return defaults;
  const stored = data.value as Partial<Tariffs>;
  return {
    singleCents: validCents(stored.singleCents) ?? defaults.singleCents,
    weeklyCents: validCents(stored.weeklyCents) ?? defaults.weeklyCents,
    biweeklyCents: validCents(stored.biweeklyCents) ?? defaults.biweeklyCents,
    storageCents: validCents(stored.storageCents) ?? defaults.storageCents,
  };
}

function validCents(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_CENTS && value <= MAX_CENTS
    ? value
    : null;
}

export function parseTariffs(input: unknown): { ok: true; value: Tariffs } | { ok: false; error: string } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const result = {} as Tariffs;
  for (const key of Object.keys(TARIFF_LABELS) as (keyof Tariffs)[]) {
    const cents = validCents(obj[key]);
    if (cents === null) {
      return {
        ok: false,
        error: `${TARIFF_LABELS[key]}: kies een bedrag tussen €${MIN_CENTS / 100} en €${MAX_CENTS / 100}`,
      };
    }
    result[key] = cents;
  }
  return { ok: true, value: result };
}
