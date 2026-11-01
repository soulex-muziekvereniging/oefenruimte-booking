import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getActiveMemberEmails } from "@/lib/members";
import { sendConfirmationEmail, sendSafely } from "@/lib/email";
import { adminEmailOf, cleanNote, todayLabel } from "@/lib/paymentAdmin";

// Openstaand betaalverzoek van een losse boeking (tab Betalingen) met de hand afhandelen:
// { action: "mark-paid", how } = buiten Mollie betaald (band krijgt de gewone bevestiging),
// { action: "waive", reason } = hoeft niet meer betaald te worden. De boeking blijft staan.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const by = await adminEmailOf(request);
  const now = new Date().toISOString();
  let update: Record<string, unknown>;
  let how = "";

  if (body.action === "mark-paid") {
    how = cleanNote(body.how, 120);
    if (!how) {
      return NextResponse.json(
        { error: "Vul in hoe er betaald is (bijv. contant of overboeking)" },
        { status: 400 }
      );
    }
    update = {
      payment_status: "paid",
      paid_by: how,
      paid_at: now,
      admin_note: `Handmatig als betaald geregistreerd (${by}, ${todayLabel()})`,
    };
  } else if (body.action === "waive") {
    const reason = cleanNote(body.reason);
    update = {
      payment_status: "waived",
      admin_note: `Kwijtgescholden${reason ? `: ${reason}` : ""} (${by}, ${todayLabel()})`,
    };
  } else {
    return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .update({ ...update, updated_at: now })
    .eq("id", id)
    .eq("status", "confirmed")
    .eq("payment_status", "open")
    .select()
    .maybeSingle();
  if (!booking) {
    return NextResponse.json(
      { error: "Kon deze boeking niet afhandelen (al betaald, kwijtgescholden of geannuleerd?)" },
      { status: 400 }
    );
  }

  if (body.action === "mark-paid") {
    const bandEmails = await getActiveMemberEmails(booking.band_name, booking.contact_email);
    await sendSafely("bevestiging handmatige betaling boeking", () =>
      sendConfirmationEmail(booking, bandEmails, how)
    );
  }
  return NextResponse.json({ success: true });
}
