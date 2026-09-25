import { NextResponse } from "next/server";
import { config } from "@/config";
import { supabase, BookingPackage } from "./supabase";
import { mollie } from "./mollie";

// Start de Mollie-betaling voor een net aangemaakt (pending) pakket. Lukt dat niet, dan
// gaat het pakket (en via ON DELETE CASCADE ook de boekingen) weg, zodat de slots niet
// bezet blijven.
export async function startPackagePayment(pkg: BookingPackage) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  try {
    const payment = (await mollie.payments.create({
      amount: { currency: config.currency, value: (pkg.price_cents / 100).toFixed(2) },
      description: `${config.roomName} - ${config.packagePricing.label} vanaf ${pkg.first_date} - ${pkg.band_name}`,
      redirectUrl: `${appUrl}/pakket/success?id=${pkg.id}`,
      webhookUrl: `${appUrl}/api/webhooks/mollie-package`,
      metadata: { packageId: pkg.id },
    })) as { id: string; getCheckoutUrl: () => string | null };

    await supabase
      .from("booking_packages")
      .update({ mollie_payment_id: payment.id })
      .eq("id", pkg.id);
    // Elke sessie verwijst naar dezelfde betaling, zodat annuleren van één sessie het
    // deelbedrag via de bestaande annuleer-routes kan terugstorten.
    await supabase
      .from("bookings")
      .update({ mollie_payment_id: payment.id })
      .eq("package_id", pkg.id);

    return NextResponse.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Mollie payment creation failed (pakket):", err);
    await supabase.from("booking_packages").delete().eq("id", pkg.id);
    return NextResponse.json(
      { error: "Kon de betaling niet starten, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
