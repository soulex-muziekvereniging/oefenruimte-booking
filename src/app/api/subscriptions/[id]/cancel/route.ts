import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { sendSubscriptionCancellationNotification } from "@/lib/email";

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

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select()
    .eq("id", id)
    .eq("cancel_token", cancelToken)
    .eq("status", "active")
    .single();

  if (error || !subscription) {
    return NextResponse.json(
      { error: "Vaste reservering niet gevonden of kan niet worden opgezegd" },
      { status: 404 }
    );
  }

  if (subscription.mollie_subscription_id && subscription.mollie_customer_id) {
    try {
      await mollie.customerSubscriptions.cancel(subscription.mollie_subscription_id, {
        customerId: subscription.mollie_customer_id,
      });
    } catch (err) {
      console.error("Mollie subscription cancel failed:", err);
      return NextResponse.json(
        { error: "Kon de vaste reservering niet opzeggen, probeer het later opnieuw" },
        { status: 500 }
      );
    }
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await sendSubscriptionCancellationNotification(subscription);

  return NextResponse.json({ success: true });
}
