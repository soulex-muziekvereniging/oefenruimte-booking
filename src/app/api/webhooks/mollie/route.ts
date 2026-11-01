import { NextRequest, NextResponse } from "next/server";
import { supabase, Booking } from "@/lib/supabase";
import { mollie, payerName } from "@/lib/mollie";
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
    metadata: { bookingId: string; kind?: string };
    details?: { consumerName?: string | null; cardHolder?: string | null } | null;
  };
  const paidBy = payerName(payment);
  const bookingId = payment.metadata.bookingId;

  // Betaling via de betaallink van een boeking die het beheer heeft ingepland: de boeking
  // staat al vast, alleen de betaling afronden.
  if (payment.metadata.kind === "request") {
    if (payment.status === "paid") await handleRequestPaid(bookingId, paymentId, paidBy);
    return NextResponse.json({ received: true });
  }

  if (payment.status === "paid") {
    // Alleen bijwerken als de boeking nog "pending" is - anders overschrijft een
    // vertraagde of dubbele webhook-aflevering een boeking die inmiddels al
    // geannuleerd is, en komt hij ongewild weer als bevestigd terug.
    const { data: booking } = await supabase
      .from("bookings")
      .update({ status: "confirmed", paid_by: paidBy, updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (booking) {
      await notifyConfirmed(booking, paidBy);
    } else {
      await handleLatePayment(bookingId, paymentId, paidBy);
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

async function notifyConfirmed(booking: Booking, paidBy: string | null) {
  const bandEmails = await getActiveMemberEmails(booking.band_name, booking.contact_email);
  await sendSafely("bevestiging boeking", () => sendConfirmationEmail(booking, bandEmails, paidBy));
  await sendSafely("boekingsmelding bestuur", () => sendBookingNotificationToOrg(booking));
}

// De betaling kwam binnen nadat de boeking al op "expired" was gezet (onbetaald na
// pendingExpiryMinutes). Is het slot nog vrij, dan alsnog bevestigen; anders is het geld
// binnen voor een slot dat inmiddels vergeven is - dan terugbetalen.
async function handleLatePayment(bookingId: string, paymentId: string, paidBy: string | null) {
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
      .update({ status: "confirmed", paid_by: paidBy, updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "expired")
      .select()
      .maybeSingle();
    if (revived) {
      await notifyConfirmed(revived, paidBy);
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

// Betaalverzoek van het beheer is betaald. Alleen bijwerken als het nog openstaat; is de
// boeking intussen geannuleerd, kwijtgescholden of al (handmatig) betaald, dan het geld
// terugstorten en het bestuur inlichten.
async function handleRequestPaid(bookingId: string, paymentId: string, paidBy: string | null) {
  const now = new Date().toISOString();
  const { data: booking } = await supabase
    .from("bookings")
    .update({
      payment_status: "paid",
      mollie_payment_id: paymentId,
      paid_by: paidBy,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .eq("payment_status", "open")
    .select()
    .maybeSingle();

  if (booking) {
    const bandEmails = await getActiveMemberEmails(booking.band_name, booking.contact_email);
    await sendSafely("bevestiging betaling (betaalverzoek)", () =>
      sendConfirmationEmail(booking, bandEmails, paidBy)
    );
    return;
  }

  const { data: current } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!current || current.mollie_payment_id === paymentId) return; // dubbele webhook

  let refunded = false;
  try {
    await mollie.paymentRefunds.create({
      paymentId,
      amount: { currency: "EUR", value: (current.price_cents / 100).toFixed(2) },
    });
    refunded = true;
  } catch (err) {
    console.error(`Terugbetaling van betaling ${paymentId} mislukt:`, err);
  }
  await sendSafely("melding betaling niet nodig", () =>
    sendAdminAlertToOrg(
      `betaling van ${current.band_name} was niet (meer) nodig`,
      `${current.band_name} betaalde voor ${current.slot_date} ${current.slot_start_time.slice(0, 5)}, maar de boeking was al geannuleerd, betaald of kwijtgescholden. ` +
        (refunded
          ? "Het bedrag is automatisch teruggestort via Mollie."
          : `Automatisch terugstorten lukte niet - stort handmatig terug via Mollie (betaling ${paymentId}).`)
    )
  );
}
