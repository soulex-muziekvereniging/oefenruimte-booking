import { supabase } from "./supabase";
import { getAdminId } from "./adminAuth";
import type { NextRequest } from "next/server";

// Gedeelde hulp voor het met de hand afhandelen van een betaalperiode (kwijtschelden,
// handmatig betaald). De opmerking gaat in subscription_payments.admin_note (migratie 017);
// bestaat die kolom nog niet, dan wordt de actie zonder opmerking uitgevoerd.

export async function adminEmailOf(request: NextRequest): Promise<string> {
  const adminId = getAdminId(request);
  const { data } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  return data?.email ?? "onbekend";
}

export function cleanNote(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Werk een nog onbetaalde periode bij; geeft de bijgewerkte rij terug of null.
export async function updateUnpaidPeriod(
  id: string,
  update: Record<string, unknown>,
  note: string
) {
  const attempt = (withNote: boolean) =>
    supabase
      .from("subscription_payments")
      .update(withNote ? { ...update, admin_note: note } : update)
      .eq("id", id)
      .eq("status", "unpaid")
      .select()
      .maybeSingle();

  let { data, error } = await attempt(true);
  if (error?.code === "42703" || error?.message?.includes("admin_note")) {
    ({ data, error } = await attempt(false)); // migratie 017 nog niet uitgevoerd
  }
  return error ? null : data;
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
