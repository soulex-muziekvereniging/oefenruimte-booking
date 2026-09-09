import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyMagicLinkToken } from "@/lib/magicLink";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = token ? verifyMagicLinkToken(token) : null;

  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, band_name, slot_date, slot_start_time, slot_end_time, price_cents, status, cancel_token"
    )
    .ilike("contact_email", email)
    .in("status", ["pending", "confirmed"])
    .order("slot_date", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, band_name, weekday, dagdeel_id, frequency, price_cents, status, cancel_token"
    )
    .ilike("contact_email", email)
    .in("status", ["pending_first_payment", "active"]);

  return NextResponse.json({
    bookings: bookings ?? [],
    subscriptions: subscriptions ?? [],
  });
}
