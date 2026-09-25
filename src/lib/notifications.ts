import { config } from "@/config";
import { supabase } from "./supabase";

// Wie meldingen voor het bestuur krijgt (nieuwe boekingen, opzeggingen, "actie nodig"...).
// Beheerbaar via het beheerpaneel, tabel notification_recipients. Is de lijst leeg of
// niet te lezen, dan gaat alles naar het vaste verenigingsadres - er mag nooit een
// melding in het niets verdwijnen.
export async function getOrgRecipients(): Promise<string[]> {
  const { data, error } = await supabase.from("notification_recipients").select("email");
  const emails = (data ?? []).map((r) => r.email as string).filter(Boolean);
  if (error || emails.length === 0) return [config.organizationEmail];
  return emails;
}
