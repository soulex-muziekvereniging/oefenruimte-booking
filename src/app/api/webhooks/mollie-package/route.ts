import { NextRequest, NextResponse } from "next/server";
import { supabase, BookingPackage } from "@/lib/supabase";
import { mollie } from "@/lib/mollie";
import {
  sendPackageConfirmationEmail,
  sendPackageNotificationToOrg,
  sendAdminAlertToOrg,
  sendSafely,
} from "@/lib/email";
import { getActiveMemberEmails } from "@/lib/members";
import { findUnavailableDates, getPackageBookings, renewalDeadline } from "@/lib/packages";

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const paymentId = body.get("id") as string;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const payment = (await mollie.payments.get(paymentId)) as {
    status: string;
    metadata: { packageId: string };
  };
  const packageId = payment.metadata.packageId;
  const now = new Date().toISOString();

  if (payment.status === "paid") {
    // Conditioneel op "pending": een dubbele of late webhook-aflevering (Mollie roept de
    // webhook ook aan bij terugbetalingen) mag niets opnieuw bevestigen.
    const { data: pkg } = await supabase
      .from("booking_packages")
      .update({ status: "paid", updated_at: now })
      .eq("id", packageId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (pkg) {
      await supabase
        .from("bookings")
        .update({ status: "confirmed", updated_at: now })
        .eq("package_id", packageId)
        .eq("status", "pending");
      await notifyConfirmed(pkg);
    } else {
      await handleLatePayment(packageId, paymentId);
    }
  } else if (
    payment.status === "expired" ||
    payment.status === "failed" ||
    payment.status === "canceled"
  ) {
    await supabase
      .from("booking_packages")
      .update({ status: "expired", updated_at: now })
      .eq("id", packageId)
      .eq("status", "pending");
    await supabase
      .from("bookings")
      .update({ status: "expired", updated_at: now })
      .eq("package_id", packageId)
      .eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}

async function notifyConfirmed(pkg: BookingPackage) {
  const bookings = (await getPackageBookings(pkg.id)).filter((b) => b.status === "confirmed");
  const bandEmails = await getActiveMemberEmails(pkg.band_name);
  await sendSafely("bevestiging pakket", () =>
    sendPackageConfirmationEmail(pkg, bookings, renewalDeadline(pkg), bandEmails)
  );
  await sendSafely("pakketmelding bestuur", () => sendPackageNotificationToOrg(pkg, bookings));
}

// Betaald nadat het pakket al verlopen was (niet binnen pendingExpiryMinutes afgerond).
// Zijn alle data nog vrij, dan alsnog bevestigen; anders alles terugstorten - een half
// pakket leveren maakt het alleen maar ingewikkeld.
async function handleLatePayment(packageId: string, paymentId: string) {
  const { data: pkg } = await supabase
    .from("booking_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();

  if (!pkg || pkg.status !== "expired") return; // al verwerkt

  const bookings = await getPackageBookings(packageId);
  const dates = bookings.map((b) => b.slot_date);
  const unavailable = dates.length > 0 ? await findUnavailableDates(dates, pkg.dagdeel_id) : dates;

  if (dates.length > 0 && unavailable.length === 0) {
    const now = new Date().toISOString();
    const { data: revived } = await supabase
      .from("booking_packages")
      .update({ status: "paid", updated_at: now })
      .eq("id", packageId)
      .eq("status", "expired")
      .select()
      .maybeSingle();
    if (revived) {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "confirmed", updated_at: now })
        .eq("package_id", packageId)
        .eq("status", "expired");
      if (!error) {
        await notifyConfirmed(revived);
        return;
      }
      // Net tegelijk bezet geraakt (unieke index) - terug naar verlopen en terugstorten.
      await supabase
        .from("booking_packages")
        .update({ status: "expired", updated_at: now })
        .eq("id", packageId);
    }
  }

  let refunded = false;
  try {
    await mollie.paymentRefunds.create({
      paymentId,
      amount: { currency: "EUR", value: (pkg.price_cents / 100).toFixed(2) },
    });
    refunded = true;
  } catch (err) {
    console.error(`Terugbetaling van te late pakketbetaling ${paymentId} mislukt:`, err);
  }

  await sendSafely("melding te late pakketbetaling", () =>
    sendAdminAlertToOrg(
      `te late betaling pakket ${pkg.band_name}`,
      `${pkg.band_name} (${pkg.contact_email}) betaalde een pakket vanaf ${pkg.first_date}, maar pas nadat de reservering was verlopen en niet alle data meer vrij waren. ` +
        (refunded
          ? "Het bedrag is automatisch teruggestort via Mollie."
          : `Automatisch terugstorten lukte niet - stort handmatig terug via Mollie (betaling ${paymentId}).`)
    )
  );
}
