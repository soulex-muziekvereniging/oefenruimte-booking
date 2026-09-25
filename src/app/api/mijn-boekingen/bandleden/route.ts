import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { getActiveMemberEmails } from "@/lib/members";
import { sendBandMemberAddedEmail, sendSafely } from "@/lib/email";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, newEmail } = body;
  const email = token ? verifyMagicLinkToken(token) : null;

  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  if (!newEmail) {
    return NextResponse.json({ error: "Vul een e-mailadres in" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("name")
    .ilike("email", email)
    .eq("active", true)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { error: "Je bent geen actief lid, neem contact op met het bestuur" },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("members").insert({
    name: member.name,
    email: newEmail.toLowerCase().trim(),
    active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Dit e-mailadres staat al op de ledenlijst" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Kon e-mailadres niet toevoegen" },
      { status: 500 }
    );
  }

  // Iedereen in de band (ook het nieuwe lid) hoort wie er is toegevoegd en door wie.
  const cleanEmail = newEmail.toLowerCase().trim();
  const bandEmails = await getActiveMemberEmails(member.name);
  await sendSafely("melding nieuw bandlid", () =>
    sendBandMemberAddedEmail(member.name, cleanEmail, email, bandEmails)
  );

  return NextResponse.json({ success: true });
}
