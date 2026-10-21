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

// Afmeldtermijn: tot zoveel uur van tevoren kan een band een repetitie van de vaste plek
// annuleren of verzetten (besluit bestuur 21 okt 2026: 72 uur). Keuzes in het beheer.
export const CANCEL_HOUR_OPTIONS = [48, 72, 96, 120, 168] as const;

export type PaymentTerms = { graceDays: number; cancelHours: number };

export function parseGraceDays(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= GRACE_MIN_DAYS && n <= GRACE_MAX_DAYS ? n : null;
}

export function parseCancelHours(value: unknown): number | null {
  const n = Number(value);
  return (CANCEL_HOUR_OPTIONS as readonly number[]).includes(n) ? n : null;
}

export async function getPaymentTerms(): Promise<PaymentTerms> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "payment_terms")
    .maybeSingle();
  const stored = (data?.value ?? {}) as { graceDays?: unknown; cancelHours?: unknown };
  return {
    graceDays: parseGraceDays(stored.graceDays) ?? config.subscriptionGraceDays,
    cancelHours: parseCancelHours(stored.cancelHours) ?? config.subscriptionCancelHours,
  };
}

export async function getGraceDays(): Promise<number> {
  return (await getPaymentTerms()).graceDays;
}

export async function getCancelHours(): Promise<number> {
  return (await getPaymentTerms()).cancelHours;
}
