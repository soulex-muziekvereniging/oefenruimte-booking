import { supabase } from "./supabase";
import { todayStr } from "./date";

// Boekjaar van de vereniging. Standaard het kalenderjaar; de startmaand is instelbaar in
// beheer > Instellingen (tabel settings, key "fiscal_year"). Een boekjaar wordt aangeduid
// met het jaar waarin het begint (2026, of 2026/2027 als het niet in januari begint).
export const FIRST_FISCAL_YEAR = 2026; // het jaar waarin het systeem in gebruik ging

export function parseStartMonth(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export async function getFiscalStartMonth(): Promise<number> {
  const { data } = await supabase.from("settings").select("value").eq("key", "fiscal_year").maybeSingle();
  return parseStartMonth((data?.value as { startMonth?: unknown } | undefined)?.startMonth) ?? 1;
}

// [begin, eind) als datums (JJJJ-MM-DD).
export function fiscalYearRange(year: number, startMonth: number): { from: string; to: string } {
  const mm = String(startMonth).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year + 1}-${mm}-01` };
}

export function currentFiscalYear(startMonth: number): number {
  const [y, m] = todayStr().split("-").map(Number);
  return m >= startMonth ? y : y - 1;
}

export function fiscalYearLabel(year: number, startMonth: number): string {
  return startMonth === 1 ? String(year) : `${year}/${year + 1}`;
}
