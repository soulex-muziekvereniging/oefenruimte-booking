import { NextRequest, NextResponse } from "next/server";
import { noteBorghChanges } from "@/lib/borghSync";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getSlotsForRange } from "@/lib/slots";
import { getActiveMemberEmails } from "@/lib/members";
import { sendSwapUndoneEmail, sendSafely } from "@/lib/email";

// Een verplaatsing terugdraaien (bv. als een band per ongeluk verkeerd verzet heeft): de
// repetitie gaat terug naar het oorspronkelijke moment en telt niet meer mee voor het
// maximum aantal verplaatsingen. Kan alleen als dat moment nog vrij is.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  const { id } = await params;

  const { data: swap } = await supabase
    .from("subscription_swaps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!swap) {
    return NextResponse.json({ error: "Verplaatsing niet gevonden" }, { status: 404 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", swap.subscription_id)
    .maybeSingle();

  // Is het oorspronkelijke moment intussen door een ander geboekt? Dan niet terugzetten.
  if (subscription) {
    const [day] = await getSlotsForRange(swap.original_date, swap.original_date);
    const slot = day?.slots.find((s) => s.dagdeelId === subscription.dagdeel_id);
    if (slot && !slot.available) {
      return NextResponse.json(
        {
          error:
            "Het oorspronkelijke moment is inmiddels door een andere band geboekt. Los dat eerst op (annuleren of verplaatsen) en probeer het daarna opnieuw.",
        },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase.from("subscription_swaps").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Terugdraaien is niet gelukt" }, { status: 500 });
  }

  if (subscription) {
    const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
    await sendSafely("melding verplaatsing teruggedraaid", () =>
      sendSwapUndoneEmail(subscription, swap.original_date, swap.new_date, bandEmails)
    );
  }

  await noteBorghChanges();
  return NextResponse.json({ success: true });
}
