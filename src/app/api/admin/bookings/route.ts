import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { todayStr } from "@/lib/date";
import { getSlotsForRange } from "@/lib/slots";
import { sendConfirmationEmail, sendSafely } from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .in("status", ["confirmed", "pending"])
    .gte("slot_date", todayStr())
    .order("slot_date", { ascending: true })
    .order("slot_start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Kon boekingen niet ophalen" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Handmatig een losse boeking toevoegen (bv. een afspraak van vóór dit systeem
// overzetten) - komt direct als "confirmed" binnen, geen Mollie-betaling nodig.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json();
  const { bandName, contactName, contactEmail, contactPhone, slotDate, dagdeelId } = body;

  if (!bandName || !contactName || !contactEmail || !slotDate || !dagdeelId) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId);
  if (!dagdeel) {
    return NextResponse.json({ error: "Ongeldig dagdeel" }, { status: 400 });
  }

  const startTime = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;
  const endHour = dagdeel.startHour + config.slotDurationMinutes / 60;
  const endTime = `${endHour.toString().padStart(2, "0")}:00`;

  const days = await getSlotsForRange(slotDate, slotDate);
  const slot = days[0]?.slots.find((s) => s.dagdeelId === dagdeelId);
  if (!slot || !slot.available) {
    return NextResponse.json({ error: "Dit tijdslot is al bezet" }, { status: 409 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      slot_date: slotDate,
      slot_start_time: startTime,
      slot_end_time: endTime,
      price_cents: config.pricePerSlotCents,
      status: "confirmed",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Dit tijdslot is al bezet" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de boeking" },
      { status: 500 }
    );
  }

  const bandEmails = await getActiveMemberEmails(booking.band_name, booking.contact_email);
  await sendSafely("bevestiging boeking (handmatig)", () => sendConfirmationEmail(booking, bandEmails));

  return NextResponse.json(booking);
}
