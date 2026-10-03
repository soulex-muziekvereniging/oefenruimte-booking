import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getActiveMemberEmails } from "@/lib/members";
import { sendPeriodPaymentConfirmationEmail, sendSafely } from "@/lib/email";
import { adminEmailOf, cleanNote, todayLabel, updateUnpaidPeriod } from "@/lib/paymentAdmin";
import type { Subscription, SubscriptionPayment } from "@/lib/supabase";

// Een periode is buiten Mollie betaald (contant, overboeking): met de hand als betaald
// registreren. { how } is verplicht, bv. "contant aan Teun" of "overboeking 3 okt"; dat
// komt bij "betaald door" te staan. Loopt de reservering nog, dan krijgt de band de
// gewone bevestigingsmail.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const how = cleanNote(body.how, 120);
  if (!how) {
    return NextResponse.json(
      { error: "Vul in hoe er betaald is (bijv. contant of overboeking)" },
      { status: 400 }
    );
  }
  const by = await adminEmailOf(request);

  const period = await updateUnpaidPeriod(
    id,
    {
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: how,
      updated_at: new Date().toISOString(),
    },
    `Handmatig als betaald geregistreerd (${by}, ${todayLabel()})`
  );
  if (!period) {
    return NextResponse.json(
      { error: "Kon deze periode niet als betaald registreren (al afgehandeld?)" },
      { status: 400 }
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", period.subscription_id)
    .maybeSingle();
  if (subscription?.status === "active") {
    const members = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
    await sendSafely("bevestiging handmatige betaling", () =>
      sendPeriodPaymentConfirmationEmail(
        subscription as Subscription,
        period as SubscriptionPayment,
        members,
        how
      )
    );
  }

  return NextResponse.json({ success: true });
}
