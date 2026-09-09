import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createMagicLinkToken } from "@/lib/magicLink";
import { sendMyBookingsLinkEmail } from "@/lib/email";

const GENERIC_RESPONSE = {
  message:
    "Als deze bandnaam en dit e-mailadres bij elkaar horen, ontvang je zo een e-mail met een link.",
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { bandName, email } = body;

  if (!bandName || !email) {
    return NextResponse.json(
      { error: "Vul zowel je bandnaam als je e-mailadres in" },
      { status: 400 }
    );
  }

  // Geen onderscheid maken tussen "band onbekend" en "e-mail onbekend" in de
  // response - dat voorkomt dat iemand de ledenlijst kan aftasten.
  const { data: member } = await supabase
    .from("members")
    .select("email")
    .ilike("name", bandName.trim())
    .ilike("email", email.trim())
    .eq("active", true)
    .maybeSingle();

  if (member) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const token = createMagicLinkToken(member.email);
    const link = `${appUrl}/mijn-boekingen/overzicht?token=${token}`;
    await sendMyBookingsLinkEmail(member.email, link);
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
