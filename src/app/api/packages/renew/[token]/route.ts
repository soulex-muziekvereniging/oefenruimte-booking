import { NextRequest, NextResponse } from "next/server";
import { supabase, BookingPackage } from "@/lib/supabase";
import { config } from "@/config";
import { slotStartInstant } from "@/lib/date";
import {
  createPackage,
  findUnavailableDates,
  nextPackageFirstDate,
  packageDates,
  renewalDeadline,
} from "@/lib/packages";
import { startPackagePayment } from "@/lib/packagePayment";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadPackage(token: string): Promise<BookingPackage | null> {
  if (!UUID_RE.test(token)) return null;
  const { data } = await supabase
    .from("booking_packages")
    .select("*")
    .eq("renew_token", token)
    .eq("status", "paid")
    .maybeSingle();
  return data;
}

async function isAlreadyRenewed(pkg: BookingPackage): Promise<boolean> {
  const { data } = await supabase
    .from("booking_packages")
    .select("id")
    .eq("renewal_of", pkg.id)
    .eq("status", "paid")
    .limit(1);
  return (data ?? []).length > 0;
}

function firstStartHasPassed(pkg: BookingPackage, firstDate: string): boolean {
  const dagdeel = config.dagdelen.find((d) => d.id === pkg.dagdeel_id);
  if (!dagdeel) return true;
  const start = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;
  return slotStartInstant(firstDate, start).getTime() <= Date.now();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pkg = await loadPackage(token);
  if (!pkg) {
    return NextResponse.json({ error: "Deze verleng-link is ongeldig." }, { status: 404 });
  }

  const dates = packageDates(nextPackageFirstDate(pkg));
  const expired = firstStartHasPassed(pkg, dates[0]);
  const unavailable = expired ? [] : await findUnavailableDates(dates, pkg.dagdeel_id);

  return NextResponse.json({
    bandName: pkg.band_name,
    dagdeelId: pkg.dagdeel_id,
    lastDate: pkg.last_date,
    renewBy: renewalDeadline(pkg),
    priceCents: config.packagePricing.priceCents,
    dates,
    unavailableDates: unavailable,
    alreadyRenewed: await isAlreadyRenewed(pkg),
    expired,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pkg = await loadPackage(token);
  if (!pkg) {
    return NextResponse.json({ error: "Deze verleng-link is ongeldig." }, { status: 404 });
  }
  if (await isAlreadyRenewed(pkg)) {
    return NextResponse.json({ error: "Dit pakket is al verlengd." }, { status: 409 });
  }

  const firstDate = nextPackageFirstDate(pkg);
  if (firstStartHasPassed(pkg, firstDate)) {
    return NextResponse.json(
      { error: "Verlengen kan niet meer - boek gerust een nieuw pakket via de homepage." },
      { status: 400 }
    );
  }

  const result = await createPackage({
    bandName: pkg.band_name,
    contactName: pkg.contact_name,
    contactEmail: pkg.contact_email,
    contactPhone: pkg.contact_phone,
    dagdeelId: pkg.dagdeel_id,
    firstDate,
    renewalOf: pkg.id,
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
