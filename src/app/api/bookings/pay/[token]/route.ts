import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie, isPaymentInProgress } from "@/lib/mollie";
import { config } from "@/config";

// Betaallink van een losse boeking die het beheer heeft ingepland met betaalverzoek
// (bookings.payment_status = "open", migratie 022). GET = info voor de betaalpagina,
// POST = Mollie-betaling starten. De betaling wordt pas bij het klikken gemaakt, zodat de
// link uit de mail niet verloopt.

async function findBooking(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await supabase.from("bookings").select("*").eq("pay_token", token).maybeSingle();
  // Alleen boekingen met een betaalverzoek; gewone boekingen hebben ook een token.
  return data?.payment_status ? data : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const booking = await findBooking(token);
  if (!booking) {
    return NextResponse.json({ error: "Betaallink niet gevonden" }, { status: 404 });
  }

  // "processing": er loopt al een betaling (of hij is betaald en de webhook komt zo) - dan
  // geen nieuwe betaalknop, anders betaalt een band per ongeluk dubbel.
  const status =
    booking.status === "cancelled"
      ? "cancelled"
      : booking.payment_status === "open" && (await isPaymentInProgress(booking.pending_payment_id))
        ? "processing"
        : booking.payment_status;

  return NextResponse.json({
    status,
    amountCents: booking.price_cents,
    bandName: booking.band_name,
    date: booking.slot_date,
    startTime: booking.slot_start_time.slice(0, 5),
    endTime: booking.slot_end_time.slice(0, 5),
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const booking = await findBooking(token);
  if (!booking) {
    return NextResponse.json({ error: "Betaallink niet gevonden" }, { status: 404 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "Deze boeking is geannuleerd" }, { status: 400 });
  }
  if (booking.payment_status !== "open") {
    return NextResponse.json(
      { error: "Deze boeking is al betaald of hoeft niet meer betaald te worden" },
      { status: 400 }
    );
  }
  if (await isPaymentInProgress(booking.pending_payment_id)) {
    return NextResponse.json(
      { error: "Er loopt al een betaling voor deze boeking. Even geduld - vernieuw de pagina over een minuutje." },
      { status: 409 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  try {
    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: (booking.price_cents / 100).toFixed(2) },
      description: `${config.roomName} - ${booking.slot_date} ${booking.slot_start_time.slice(0, 5)}-${booking.slot_end_time.slice(0, 5)} - ${booking.band_name}`,
      redirectUrl: `${appUrl}/boeking/betalen?token=${token}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie`,
      metadata: { bookingId: booking.id, kind: "request" },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase.from("bookings").update({ pending_payment_id: payment.id }).eq("id", booking.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie-betaling voor betaalverzoek mislukt:", err);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
