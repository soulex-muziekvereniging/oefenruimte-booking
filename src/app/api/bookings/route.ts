import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import { config } from "@/config";
import { expireStalePendingBookings } from "@/lib/expire";
import { getSlotsForRange } from "@/lib/slots";
import { slotStartInstant, nowInAmsterdam, toLocalDateStr } from "@/lib/date";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { bandName, contactName, contactEmail, contactPhone, slotDate, slotStartTime } = body;

  if (!bandName || !contactName || !contactEmail || !slotDate || !slotStartTime) {
    return NextResponse.json(
      { error: "Vul alle verplichte velden in" },
      { status: 400 }
    );
  }

  await expireStalePendingBookings();

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", contactEmail.toLowerCase().trim())
    .eq("active", true)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      {
        error: `Dit e-mailadres staat niet geregistreerd als lid van ${config.organizationName}. Neem contact op om lid te worden voordat je kan boeken.`,
      },
      { status: 403 }
    );
  }

  const startHour = parseInt(slotStartTime.split(":")[0], 10);
  const dagdeel = config.dagdelen.find((d) => d.startHour === startHour);
  if (!dagdeel || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    return NextResponse.json({ error: "Ongeldig tijdslot" }, { status: 400 });
  }

  const latest = nowInAmsterdam();
  latest.setDate(latest.getDate() + config.maxWeeksAhead * 7);
  if (slotStartInstant(slotDate, slotStartTime).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Dit tijdslot is al begonnen of voorbij" }, { status: 400 });
  }
  if (slotDate > toLocalDateStr(latest)) {
    return NextResponse.json(
      { error: `Je kunt maximaal ${config.maxWeeksAhead} weken vooruit boeken` },
      { status: 400 }
    );
  }

  // De unieke index op bookings vangt alleen dubbele losse boekingen af - niet een
  // vaste reservering (of een daarheen geruilde repetitie) op hetzelfde moment.
  const days = await getSlotsForRange(slotDate, slotDate);
  const slot = days[0]?.slots.find((s) => s.dagdeelId === dagdeel.id);
  if (!slot || !slot.available) {
    return NextResponse.json({ error: "Dit tijdslot is al geboekt" }, { status: 409 });
  }

  const endHour = startHour + config.slotDurationMinutes / 60;
  const endTime = `${endHour.toString().padStart(2, "0")}:00`;

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      slot_date: slotDate,
      slot_start_time: slotStartTime,
      slot_end_time: endTime,
      price_cents: config.pricePerSlotCents,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Dit tijdslot is al geboekt" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de boeking" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const priceStr = (config.pricePerSlotCents / 100).toFixed(2);

  try {
    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: priceStr },
      description: `${config.roomName} - ${slotDate} ${slotStartTime}-${endTime} - ${bandName}`,
      redirectUrl: `${appUrl}/booking/success?id=${booking.id}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie`,
      metadata: { bookingId: booking.id },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase
      .from("bookings")
      .update({ mollie_payment_id: payment.id })
      .eq("id", booking.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie payment creation failed:", err);
    // Betaling kon niet gestart worden - laat het slot niet als bezet achter.
    await supabase.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
