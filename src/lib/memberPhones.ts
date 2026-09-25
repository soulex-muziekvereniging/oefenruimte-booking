import { supabase } from "./supabase";

// Regel van het bestuur: elke band heeft minstens één telefoonnummer in de ledenlijst.
// Geeft true als een ander lid van deze band (dan excludeMemberId) al een nummer heeft.
export async function bandHasOtherPhone(bandName: string, excludeMemberId?: string): Promise<boolean> {
  const { data } = await supabase
    .from("members")
    .select("id, phone")
    .ilike("name", bandName.trim());
  return (data ?? []).some((m) => m.id !== excludeMemberId && !!m.phone?.trim());
}

export function cleanPhone(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
