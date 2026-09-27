import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createMagicLinkToken } from "@/lib/magicLink";
import { sendMyBookingsLinkEmail, sendSafely } from "@/lib/email";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const GENERIC_RESPONSE = {
  message:
    "Staat dit e-mailadres op de ledenlijst, dan ontvang je zo een e-mail met een link.",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuten

export async function POST(request: NextRequest) {
  if (isRateLimited(`request-link:${getClientIp(request)}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Te veel pogingen, probeer het over 15 minuten opnieuw" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { email } = body;

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Vul je e-mailadres in" }, { status: 400 });
  }

  // Alleen het e-mailadres: de link komt toch alleen in die mailbox terecht. Een extra
  // bandnaam-check leverde vooral gemiste mails op (bands weten niet altijd precies hoe
  // hun naam in de ledenlijst staat). Zelfde antwoord bij bekend en onbekend adres, zodat
  // niemand de ledenlijst kan aftasten.
  const { data: member } = await supabase
    .from("members")
    .select("email")
    .ilike("email", email.trim())
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (member) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const token = createMagicLinkToken(member.email);
    const link = `${appUrl}/mijn-boekingen/overzicht?token=${token}`;
    await sendSafely("mijn-boekingen-link", () => sendMyBookingsLinkEmail(member.email, link));
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
