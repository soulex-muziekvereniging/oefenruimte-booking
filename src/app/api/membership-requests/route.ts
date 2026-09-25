import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMembershipRequestNotificationToOrg, sendSafely } from "@/lib/email";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 uur

export async function POST(request: NextRequest) {
  if (isRateLimited(`membership-request:${getClientIp(request)}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Te veel aanvragen, probeer het later opnieuw" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { bandName, contactName, contactEmail, contactPhone } = body;

  if (!bandName || !contactName || !contactEmail || !contactPhone?.trim()) {
    return NextResponse.json(
      { error: "Vul bandnaam, contactpersoon en e-mailadres in" },
      { status: 400 }
    );
  }

  const { data: request_, error } = await supabase
    .from("membership_requests")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Kon het verzoek niet versturen, probeer het later opnieuw" },
      { status: 500 }
    );
  }

  // Het verzoek staat al in de database en is zichtbaar in /admin - een mislukte
  // melding mag de aanvraag voor de band niet laten mislukken.
  await sendSafely("melding lidmaatschapsverzoek", () =>
    sendMembershipRequestNotificationToOrg(request_)
  );

  return NextResponse.json({ success: true });
}
