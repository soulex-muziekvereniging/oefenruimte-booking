import { supabase } from "./supabase";

// Schakelaar "Rekeningen vaste plek" (beheer > Instellingen, tabel settings, key
// "invoicing"). Zolang hij uit staat, verstuurt de cron geen rekeningen, herinneringen of
// vervalmeldingen: zo kan het bestuur de vaste plekken alvast invoeren en pas "live gaan"
// als Mollie en de bands klaar zijn. Standaard UIT.
// fromDate: alleen periodes die op of na deze datum beginnen krijgen een rekening; eerdere
// periodes worden als "voor de start van de facturatie" kwijtgescholden (zonder mail).
export type InvoicingSetting = { enabled: boolean; fromDate: string | null };

export function parseInvoicing(value: unknown): InvoicingSetting {
  const v = (value ?? {}) as { enabled?: unknown; fromDate?: unknown };
  const fromDate =
    typeof v.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.fromDate) ? v.fromDate : null;
  return { enabled: v.enabled === true, fromDate };
}

export async function getInvoicing(): Promise<InvoicingSetting> {
  const { data } = await supabase.from("settings").select("value").eq("key", "invoicing").maybeSingle();
  return parseInvoicing(data?.value);
}
