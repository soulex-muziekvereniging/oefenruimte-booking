import { NextRequest, NextResponse } from "next/server";
import { supabase, Booking } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import {
  sendConfirmationEmail,
  sendBookingNotificationToOrg,
  sendAdminAlertToOrg,
  sendSafely,
} from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";
import { getSlotsForRange } from "@/lib/slots";

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
      .maybeSingle();

    if (booking) {
      await notifyConfirmed(booking);
    } else {
      await handleLatePayment(bookingId, paymentId);
    }
  } else if (
    payment.status === "expired" ||
    payment.status === "failed" ||
    payment.status === "canceled"
  ) {
    await supabase
      .from("bookings")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}

async function notifyConfirmed(booking: Booking) {
  const bandEmails = await getActiveMemberEmails(booking.band_name);
  await sendSafely("bevestiging boeking", () => sendConfirmationEmail(booking, bandEmails));
  await sendSafely("boekingsmelding bestuur", () => sendBookingNotificationToOrg(booking));
}

// De betaling kwam binnen nadat de boeking al op "expired" was gezet (onbetaald na
// pendingExpiryMinutes). Is het slot nog vrij, dan alsnog bevestigen; anders is het geld
// binnen voor een slot dat inmiddels vergeven is - dan terugbetalen.
async function handleLatePayment(bookingId: string, paymentId: string) {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.status !== "expired") return; // al verwerkt / geannuleerd

  const days = await getSlotsForRange(booking.slot_date, booking.slot_date);
  const slot = days[0]?.slots.find(
    (s) => s.startTime === booking.slot_start_time.slice(0, 5)
  );

  if (slot?.available) {
    const { data: revived } = await supabase
      .from("bookings")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "expired")
      .select()
      .maybeSingle();
    if (revived) {
      await notifyConfirmed(revived);
      return;
    }
  }

  let refunded = false;
  try {
    await mollie.paymentRefunds.create({
      paymentId,
      amount: { currency: "EUR", value: (booking.price_cents / 100).toFixed(2) },
    });
    refunded = true;
  } catch (err) {
    console.error(`Terugbetaling van te late betaling ${paymentId} mislukt:`, err);
  }

  await sendSafely("melding te late betaling", () =>
    sendAdminAlertToOrg(
      `te late betaling van ${booking.band_name}`,
      `${booking.band_name} (${booking.contact_email}) betaalde voor ${booking.slot_date} ${booking.slot_start_time.slice(0, 5)}, maar pas nadat de reservering was verlopen en het slot inmiddels bezet was. ` +
        (refunded
          ? "Het bedrag is automatisch teruggestort via Mollie."
          : `Automatisch terugstorten lukte niet - stort handmatig terug via Mollie (betaling ${paymentId}).`)
    )
  );
}
