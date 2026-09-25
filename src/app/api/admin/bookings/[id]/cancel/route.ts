import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import {
  sendCancellationNotification,
  sendBookingCancelledConfirmationEmail,
  sendSafely,
} from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

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

  // skipRefund: de beheerder heeft na een mislukte terugbetaling bewust gekozen om toch
  // te annuleren (bv. omdat het al handmatig via Mollie is teruggestort).
  const { skipRefund } = await request.json().catch(() => ({ skipRefund: false }));

  if (booking.mollie_payment_id && !skipRefund) {
    try {
      await mollie.paymentRefunds.create({
        paymentId: booking.mollie_payment_id,
        amount: {
          currency: "EUR",
          value: (booking.price_cents / 100).toFixed(2),
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "onbekende fout";
      return NextResponse.json(
        { error: `Terugstorten via Mollie mislukt: ${reason}`, refundFailed: true },
        { status: 502 }
      );
    }
  }

  await supabase
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  const refunded = !!booking.mollie_payment_id && !skipRefund;
  const bandEmails = await getActiveMemberEmails(booking.band_name, booking.contact_email);
  await sendSafely("bevestiging annulering", () =>
    sendBookingCancelledConfirmationEmail(booking, refunded, bandEmails)
  );
  await sendSafely("annuleringsmelding", () => sendCancellationNotification(booking, refunded));

  return NextResponse.json({ success: true });
}
