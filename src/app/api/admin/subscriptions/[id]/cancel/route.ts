import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { sendSubscriptionCancellationNotification } from "@/lib/email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Vaste reservering niet gevonden" }, { status: 404 });
  }

  if (subscription.status !== "active") {
    return NextResponse.json(
      { error: "Alleen actieve vaste reserveringen kunnen opgezegd worden" },
      { status: 400 }
    );
  }

  if (subscription.mollie_subscription_id && subscription.mollie_customer_id) {
    try {
      await mollie.customerSubscriptions.cancel(subscription.mollie_subscription_id, {
        customerId: subscription.mollie_customer_id,
      });
    } catch (err) {
      console.error("Mollie subscription cancel (admin) failed:", err);
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

  try {
    await sendSubscriptionCancellationNotification(subscription);
  } catch {
    // Email failure should not block cancellation
  }

  return NextResponse.json({ success: true });
}
