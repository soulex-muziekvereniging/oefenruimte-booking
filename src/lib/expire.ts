import { config } from "@/config";
import { supabase } from "./supabase";

// Een boeking/aanvraag die te lang op "pending" blijft staan (band heeft niet
// betaald of de betaalpoging afgebroken) moet het slot niet voor altijd blokkeren.
// Dit draait "lazy" - bij elke relevante aanvraag - in plaats van via een aparte
// cronjob, om het beheer simpel en gratis te houden.

export async function expireStalePendingBookings() {
  const cutoff = new Date(
    Date.now() - config.pendingExpiryMinutes * 60 * 1000
  ).toISOString();

  await supabase
    .from("bookings")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff);

  // De boekingen van een onbetaald pakket vallen hierboven al vrij; het pakket zelf ook
  // op verlopen zetten zodat de betaalpagina de juiste status toont.
  await supabase
    .from("booking_packages")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff);
}

export async function expireStalePendingSubscriptions() {
  const cutoff = new Date(
    Date.now() - config.pendingExpiryMinutes * 60 * 1000
  ).toISOString();

  await supabase
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("status", "pending_first_payment")
    .lt("created_at", cutoff);
}
