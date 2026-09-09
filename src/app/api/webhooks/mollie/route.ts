import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { sendConfirmationEmail, sendBookingNotificationToOrg } from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const paymentId = body.get("id") as string;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const payment = (await mollie.payments.get(paymentId)) as {
    status: string;
    metadata: { bookingId: string };
  };
  const bookingId = payment.metadata.bookingId;

  if (payment.status === "paid") {
    // Alleen bijwerken als de boeking nog "pending" is - anders overschrijft een
    // vertraagde of dubbele webhook-aflevering een boeking die inmiddels al
    // geannuleerd is, en komt hij ongewild weer als bevestigd terug.
    const { data: booking } = await supabase
      .from("bookings")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "pending")
      .select()
      .single();

    if (booking) {
      const bandEmails = await getActiveMemberEmails(booking.band_name);
      await sendConfirmationEmail(booking, bandEmails);
      await sendBookingNotificationToOrg(booking);
    }
  } else if (
    payment.status === "expired" ||
    payment.status === "failed" ||
    payment.status === "canceled"
  ) {
    await supabase
      .from("bookings")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", bookingId);
  }

  return NextResponse.json({ received: true });
}
