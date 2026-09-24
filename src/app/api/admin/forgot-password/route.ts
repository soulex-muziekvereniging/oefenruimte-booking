import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createResetToken } from "@/lib/adminSession";
import { sendAdminPasswordResetEmail, sendSafely } from "@/lib/email";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuten

const GENERIC_RESPONSE = {
  message: "Als dit een bekend beheerdersaccount is, ontvang je zo een e-mail met een link.",
};

export async function POST(request: NextRequest) {
  if (isRateLimited(`admin-forgot:${getClientIp(request)}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Te veel pogingen, probeer het over 15 minuten opnieuw" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "Vul je e-mailadres in" }, { status: 400 });
  }

  // Geen onderscheid maken tussen "bestaat niet" en "e-mail verstuurd" in de response -
  // voorkomt dat iemand kan aftasten welke admin-accounts er bestaan.
  const { data: admin } = await supabase
    .from("admin_users")
    .select("email")
    .ilike("email", email.trim())
    .maybeSingle();

  if (admin) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const token = createResetToken(admin.email);
    const link = `${appUrl}/admin/wachtwoord-resetten?token=${token}`;
    await sendSafely("wachtwoord-resetmail", () => sendAdminPasswordResetEmail(admin.email, link));
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
