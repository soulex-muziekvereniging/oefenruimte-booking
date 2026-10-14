import { config } from "@/config";
import { supabase } from "./supabase";

// Betaal- en afmeldregels van vaste reserveringen, instelbaar in beheer > Instellingen
// (tabel settings, key "payment_terms"); config.ts is de standaard.
//
// Vervaltermijn (coulance): zoveel dagen na de rekening vervalt de vaste plek als er nog
// niet betaald is. Minimaal 7 dagen (de herinnering gaat 7 dagen na de rekening), maximaal
// 21 (een periode duurt 28 dagen).
export const GRACE_MIN_DAYS = 7;
export const GRACE_MAX_DAYS = 21;

// Afmeldtermijn: tot zoveel dagen van tevoren kan een band een repetitie gratis annuleren.
// Minimaal 2 dagen (zoals verzetten), maximaal 14.
export const CANCEL_MIN_DAYS = 2;
export const CANCEL_MAX_DAYS = 14;

export type PaymentTerms = { graceDays: number; cancelDays: number };

function parseDays(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function parseGraceDays(value: unknown): number | null {
  return parseDays(value, GRACE_MIN_DAYS, GRACE_MAX_DAYS);
}

export function parseCancelDays(value: unknown): number | null {
  return parseDays(value, CANCEL_MIN_DAYS, CANCEL_MAX_DAYS);
}

export async function getPaymentTerms(): Promise<PaymentTerms> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "payment_terms")
    .maybeSingle();
  const stored = (data?.value ?? {}) as { graceDays?: unknown; cancelDays?: unknown };
  return {
    graceDays: parseGraceDays(stored.graceDays) ?? config.subscriptionGraceDays,
    cancelDays: parseCancelDays(stored.cancelDays) ?? config.subscriptionCancelDays,
  };
}

export async function getGraceDays(): Promise<number> {
  return (await getPaymentTerms()).graceDays;
}

export async function getCancelDays(): Promise<number> {
  return (await getPaymentTerms()).cancelDays;
}
