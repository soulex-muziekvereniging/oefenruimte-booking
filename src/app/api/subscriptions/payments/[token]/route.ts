import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { isPaymentInProgress } from "@/lib/mollie";

const DAY_NAMES_NL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

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

  const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);

  return NextResponse.json({
    // "processing": er loopt al een betaling (of hij is betaald en de webhook komt zo) -
    // dan geen nieuwe betaalknop tonen, anders betaalt een band per ongeluk dubbel.
    status:
      periodPayment.status === "unpaid" &&
      (await isPaymentInProgress(periodPayment.mollie_payment_id))
        ? "processing"
        : periodPayment.status,
    amountCents: periodPayment.amount_cents,
    periodMonth: periodPayment.period_month,
    dueDate: periodPayment.due_date,
    graceUntil: periodPayment.grace_until,
    bandName: subscription.band_name,
    weekdayDagdeel: `${DAY_NAMES_NL[subscription.weekday]} ${dagdeel?.label.toLowerCase() ?? subscription.dagdeel_id}`,
    subscriptionStatus: subscription.status,
  });
}
