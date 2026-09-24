import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { sendCancellationNotification, sendSafely } from "@/lib/email";
import { hoursUntilSlot } from "@/lib/date";
import { config } from "@/config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { cancelToken } = body;

  if (!cancelToken) {
    return NextResponse.json(
      { error: "Ongeldig annuleringsverzoek" },
      { status: 400 }
    );
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select()
    .eq("id", id)
    .eq("cancel_token", cancelToken)
    .eq("status", "confirmed")
    .single();

  if (error || !booking) {
    return NextResponse.json(
      { error: "Boeking niet gevonden of kan niet worden geannuleerd" },
      { status: 404 }
    );
  }

  if (hoursUntilSlot(booking.slot_date, booking.slot_start_time) < config.cancellationCutoffHours) {
    return NextResponse.json(
      {
        error: `Annuleren kan niet meer, dit moet uiterlijk ${config.cancellationCutoffHours} uur van tevoren. Neem contact op met ${config.organizationName}.`,
      },
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
    } catch (err) {
      console.error(`Terugbetaling voor boeking ${id} mislukt:`, err);
      return NextResponse.json(
        {
          error: `Het terugstorten lukte niet, dus de boeking is niet geannuleerd. Neem contact op met ${config.organizationEmail}.`,
        },
        { status: 502 }
      );
    }
  }

  await supabase
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  await sendSafely("annuleringsmelding", () => sendCancellationNotification(booking, !!booking.mollie_payment_id));

  return NextResponse.json({ success: true });
}
