import { supabase } from "./supabase";

// Een "band" is in de ledenlijst niets anders dan een groep members-rijen met dezelfde
// naam. Zo kunnen meerdere bandleden elk met hun eigen e-mailadres boeken, en krijgt
// bij elke actie iedereen in de band een mailtje in plaats van alleen de aanvrager.
//
// Naast de ingevulde bandnaam kijken we ook naar de band waar het e-mailadres van de
// aanvrager bij hoort - een tikfout in de bandnaam bij het boeken mag er niet toe leiden
// dat de rest van de band niets hoort.
export async function getActiveMemberEmails(
  bandName: string,
  contactEmail?: string | null
): Promise<string[]> {
  const names = new Set<string>([bandName.trim()]);

  if (contactEmail) {
    const { data: self } = await supabase
      .from("members")
      .select("name")
      .ilike("email", contactEmail.trim())
      .eq("active", true);
    for (const m of self ?? []) names.add(m.name.trim());
  }

  const emails = new Set<string>();
  for (const name of names) {
    const { data } = await supabase
      .from("members")
      .select("email")
      .ilike("name", name)
      .eq("active", true);
    for (const m of data ?? []) emails.add(m.email);
  }
  return [...emails];
}
