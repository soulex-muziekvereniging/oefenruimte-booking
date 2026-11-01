import { config } from "@/config";
import { supabase } from "./supabase";

// Hoe ver vooruit leden los kunnen boeken (en een vaste plek kunnen laten starten),
// instelbaar in beheer > Instellingen (tabel settings, key "booking_horizon");
// config.maxWeeksAhead is de standaard. Het beheer zelf mag altijd verder vooruit.
export const HORIZON_WEEK_OPTIONS = [4, 8, 13, 26] as const;

export function parseHorizonWeeks(value: unknown): number | null {
  const n = Number(value);
  return (HORIZON_WEEK_OPTIONS as readonly number[]).includes(n) ? n : null;
}

export async function getMaxWeeksAhead(): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "booking_horizon")
    .maybeSingle();
  return parseHorizonWeeks((data?.value as { weeks?: unknown } | null)?.weeks) ?? config.maxWeeksAhead;
}
