import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { config } from "@/config";
import { todayStr } from "@/lib/date";
import { createPackage, renewalDeadline } from "@/lib/packages";
import { getActiveMemberEmails } from "@/lib/members";
import { sendPackageConfirmationEmail, sendSafely } from "@/lib/email";

// Handmatig een pakket invoeren (bv. een bestaande tweewekelijkse afspraak overzetten) -
// komt direct als betaald binnen, geen Mollie. De verlengherinneringen gaan wel gewoon mee.
export async function POST(request: NextRequest) {
  const authError = verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const { bandName, contactName, contactEmail, contactPhone, firstDate, dagdeelId } = body;

  if (!bandName || !contactName || !contactEmail || !firstDate || !dagdeelId) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || !config.dagdelen.some((d) => d.id === dagdeelId)) {
    return NextResponse.json({ error: "Ongeldige datum of dagdeel" }, { status: 400 });
  }
  if (firstDate < todayStr()) {
    return NextResponse.json({ error: "De eerste datum ligt in het verleden" }, { status: 400 });
  }

  const result = await createPackage({
    bandName,
    contactName,
    contactEmail,
    contactPhone: contactPhone || null,
    dagdeelId,
    firstDate,
    initialStatus: "paid",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.unavailableDates?.length
          ? `${result.error}: ${result.unavailableDates.join(", ")}`
          : result.error,
      },
      { status: result.status }
    );
  }

  const bandEmails = await getActiveMemberEmails(bandName);
  await sendSafely("bevestiging pakket (handmatig)", () =>
    sendPackageConfirmationEmail(result.pkg, result.bookings, renewalDeadline(result.pkg), bandEmails)
  );

  return NextResponse.json(result.pkg);
}
