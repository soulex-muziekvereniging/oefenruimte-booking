import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import {
  sendSubscriptionCancellationNotification,
  sendSubscriptionCancelledConfirmationEmail,
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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Vaste reservering niet gevonden" }, { status: 404 });
  }

  if (subscription.status !== "active" && subscription.status !== "lapsed") {
    return NextResponse.json(
      { error: "Alleen actieve of vervallen vaste reserveringen kunnen opgezegd worden" },
      { status: 400 }
    );
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Opzeggen door de beheerder geeft het slot direct vrij (geen doorloop tot einde periode).
  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  await sendSafely("bevestiging opzegging (beheer)", () =>
    sendSubscriptionCancelledConfirmationEmail(subscription, null, bandEmails)
  );
  await sendSafely("melding opzegging", () => sendSubscriptionCancellationNotification(subscription));

  return NextResponse.json({ success: true });
}
