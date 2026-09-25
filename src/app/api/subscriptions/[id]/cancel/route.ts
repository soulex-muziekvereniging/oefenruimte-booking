import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  sendSubscriptionCancellationNotification,
  sendSubscriptionCancelledConfirmationEmail,
  sendSafely,
} from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";
import { todayStr } from "@/lib/date";
import { addDaysStr, addMonthsToMonthStr } from "@/lib/periods";

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

  // Wat al betaald (of kwijtgescholden) is, blijft van de band: het slot loopt door tot
  // en met de laatste dag van de laatst betaalde maand.
  const { data: lastCovered } = await supabase
    .from("subscription_payments")
    .select("period_month")
    .eq("subscription_id", id)
    .in("status", ["paid", "waived"])
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const endOfPaidMonth = lastCovered
    ? addDaysStr(addMonthsToMonthStr(lastCovered.period_month, 1), -1)
    : null;
  const activeUntil = endOfPaidMonth && endOfPaidMonth >= todayStr() ? endOfPaidMonth : null;

  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      active_until: activeUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "active");

  if (updateError) {
    return NextResponse.json(
      { error: "Opzeggen is niet gelukt, probeer het later opnieuw" },
      { status: 500 }
    );
  }

  const bandEmails = await getActiveMemberEmails(subscription.band_name);
  await sendSafely("bevestiging opzegging", () =>
    sendSubscriptionCancelledConfirmationEmail(subscription, activeUntil, bandEmails)
  );
  await sendSafely("melding opzegging", () => sendSubscriptionCancellationNotification(subscription));

  return NextResponse.json({ success: true, activeUntil });
}
