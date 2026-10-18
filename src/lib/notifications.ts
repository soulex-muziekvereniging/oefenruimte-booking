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

// Wie de mail krijgt bij een nieuwe aanvraag voor lidmaatschap ("Lid worden"). Eigen lijst in
// beheer > Instellingen (tabel settings, key "join_request_recipients"); is die leeg, dan
// gaat de melding naar de algemene lijst hierboven.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getJoinRequestList(): Promise<string[]> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "join_request_recipients")
    .maybeSingle();
  const list = Array.isArray(data?.value) ? (data!.value as unknown[]) : [];
  return list.filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e));
}

export async function getJoinRequestRecipients(): Promise<string[]> {
  const list = await getJoinRequestList();
  return list.length > 0 ? list : getOrgRecipients();
}
