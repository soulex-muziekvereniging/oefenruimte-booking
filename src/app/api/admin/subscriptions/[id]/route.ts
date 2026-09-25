import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

// Definitief opruimen van een opgezegde of vervallen vaste reservering, inclusief de
// bijbehorende betaalperiodes en ruilingen. Actieve reserveringen eerst opzeggen.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("id", id)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Vaste reservering niet gevonden" }, { status: 404 });
  }

  if (subscription.status !== "cancelled" && subscription.status !== "lapsed") {
    return NextResponse.json(
      { error: "Alleen opgezegde of vervallen vaste reserveringen kunnen verwijderd worden" },
      { status: 400 }
    );
  }

  const { error: swapsError } = await supabase
    .from("subscription_swaps")
    .delete()
    .eq("subscription_id", id);
  const { error: paymentsError } = await supabase
    .from("subscription_payments")
    .delete()
    .eq("subscription_id", id);

  if (swapsError || paymentsError) {
    return NextResponse.json({ error: "Kon vaste reservering niet verwijderen" }, { status: 500 });
  }

  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Kon vaste reservering niet verwijderen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
