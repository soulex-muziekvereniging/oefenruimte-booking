import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isPaymentInProgress } from "@/lib/mollie";
import { formatRhythm } from "@/lib/schedule";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: periodPayment } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("pay_token", token)
    .maybeSingle();

  if (!periodPayment) {
    return NextResponse.json({ error: "Betaallink niet gevonden" }, { status: 404 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", periodPayment.subscription_id)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Vaste reservering niet gevonden" }, { status: 404 });
  }


  return NextResponse.json({
    // "processing": er loopt al een betaling (of hij is betaald en de webhook komt zo) -
    // dan geen nieuwe betaalknop tonen, anders betaalt een band per ongeluk dubbel.
    status:
      periodPayment.status === "unpaid" &&
      (await isPaymentInProgress(periodPayment.mollie_payment_id))
        ? "processing"
        : periodPayment.status,
    amountCents: periodPayment.amount_cents,
    periodStart: periodPayment.period_start,
    periodEnd: periodPayment.period_end,
    dueDate: periodPayment.due_date,
    graceUntil: periodPayment.grace_until,
    bandName: subscription.band_name,
    rhythm: formatRhythm(subscription),
    subscriptionStatus: subscription.status,
  });
}
