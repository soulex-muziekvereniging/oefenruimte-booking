import { config } from "@/config";
import { supabase } from "./supabase";

// Vervaltermijn (coulance) van vaste reserveringen: zoveel dagen na de vervaldatum van
// een periode vervalt de reservering als er nog niet betaald is. Instelbaar in beheer >
// Instellingen (tabel settings, key "payment_terms"); config.ts is de standaard.
// Grenzen: minimaal 7 dagen (de herinnering gaat 7 dagen na de vervaldatum), maximaal 21
// (een periode duurt 28 dagen - langer zou bijna een hele periode gratis oefenen zijn).
export const GRACE_MIN_DAYS = 7;
export const GRACE_MAX_DAYS = 21;

export function parseGraceDays(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= GRACE_MIN_DAYS && n <= GRACE_MAX_DAYS ? n : null;
}

export async function getGraceDays(): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "payment_terms")
    .maybeSingle();
  const stored = (data?.value as { graceDays?: unknown } | undefined)?.graceDays;
  return parseGraceDays(stored) ?? config.subscriptionGraceDays;
}
