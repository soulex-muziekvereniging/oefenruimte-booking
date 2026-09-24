import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSubscriptionCancellationNotification, sendSafely } from "@/lib/email";

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

  await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await sendSafely("melding opzegging", () => sendSubscriptionCancellationNotification(subscription));

  return NextResponse.json({ success: true });
}
