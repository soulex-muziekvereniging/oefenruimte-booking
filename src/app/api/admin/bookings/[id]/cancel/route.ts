import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { sendCancellationNotification } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Alleen bevestigde boekingen kunnen geannuleerd worden" },
      { status: 400 }
    );
  }

  if (booking.mollie_payment_id) {
    try {
      await mollie.paymentRefunds.create({
        paymentId: booking.mollie_payment_id,
        amount: {
          currency: "EUR",
          value: (booking.price_cents / 100).toFixed(2),
        },
      });
    } catch {
      // Refund may fail in test mode or if already refunded
    }
  }

  await supabase
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    await sendCancellationNotification(booking);
  } catch {
    // Email failure should not block cancellation
  }

  return NextResponse.json({ success: true });
}
