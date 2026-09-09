import { supabase } from "./supabase";

// Een "band" is in de ledenlijst niets anders dan een groep members-rijen met dezelfde
// naam. Zo kunnen meerdere bandleden elk met hun eigen e-mailadres boeken, en krijgt
// bij een bevestiging iedereen in de band een mailtje in plaats van alleen de aanvrager.
export async function getActiveMemberEmails(bandName: string): Promise<string[]> {
  const { data } = await supabase
    .from("members")
    .select("email")
    .ilike("name", bandName.trim())
    .eq("active", true);

  return (data ?? []).map((m) => m.email);
}
