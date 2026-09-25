import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { slotStartInstant, nowInAmsterdam, toLocalDateStr } from "@/lib/date";
import { createPackage } from "@/lib/packages";
import { startPackagePayment } from "@/lib/packagePayment";

// Nieuw pakket "4x om de week". De eerste datum valt binnen het gewone boekingsvenster;
// de latere data mogen verder vooruit liggen - dat is juist het voordeel van een pakket.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { bandName, contactName, contactEmail, contactPhone, firstDate, dagdeelId } = body;

  if (!bandName || !contactName || !contactEmail || !firstDate || !dagdeelId) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId);
  if (!dagdeel || !/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) {
    return NextResponse.json({ error: "Ongeldige datum of dagdeel" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", String(contactEmail).toLowerCase().trim())
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

  const startTime = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;
  if (slotStartInstant(firstDate, startTime).getTime() <= Date.now()) {
    return NextResponse.json({ error: "De eerste datum is al begonnen of voorbij" }, { status: 400 });
  }
  const latest = nowInAmsterdam();
  latest.setDate(latest.getDate() + config.maxWeeksAhead * 7);
  if (firstDate > toLocalDateStr(latest)) {
    return NextResponse.json(
      { error: `De eerste datum mag maximaal ${config.maxWeeksAhead} weken vooruit liggen` },
      { status: 400 }
    );
  }

  const result = await createPackage({
    bandName,
    contactName,
    contactEmail,
    contactPhone: contactPhone || null,
    dagdeelId,
    firstDate,
    initialStatus: "pending",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, unavailableDates: result.unavailableDates },
      { status: result.status }
    );
  }

  return startPackagePayment(result.pkg);
}
