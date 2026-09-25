import { config } from "@/config";
import { supabase } from "./supabase";
import { todayStr } from "./date";

// Welke opslagruimtes zijn in gebruik? Een ruimte hoort bij een vaste reservering zolang
// die loopt (ook als hij nog op de eerste betaling wacht, of opgezegd is maar de betaalde
// periode nog doorloopt).
export async function getOccupiedStorageUnits(excludeSubscriptionId?: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, storage_unit")
    .not("storage_unit", "is", null)
    .or(
      `status.in.(active,pending_first_payment),and(status.eq.cancelled,active_until.gte.${todayStr()})`
    );
  if (error) throw new Error(`Kon opslagruimtes niet ophalen: ${error.message}`);
  return (data ?? [])
    .filter((s) => s.id !== excludeSubscriptionId)
    .map((s) => s.storage_unit as string);
}

export async function getFreeStorageUnits(excludeSubscriptionId?: string): Promise<string[]> {
  const occupied = new Set(await getOccupiedStorageUnits(excludeSubscriptionId));
  return config.storage.units.filter((u) => !occupied.has(u));
}
