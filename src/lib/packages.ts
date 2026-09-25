import { config } from "@/config";
import { supabase, Booking, BookingPackage } from "./supabase";
import { addDaysStr } from "./periods";
import { getSlotsForRange } from "./slots";

// Een pakket is niets meer dan `sessions` losse boekingen, telkens `intervalWeeks` uit
// elkaar, met één gezamenlijke betaling. Zie ook supabase/migrations/009_booking_packages.sql.

const INTERVAL_DAYS = config.packagePricing.intervalWeeks * 7;

export function packageDates(firstDate: string): string[] {
  return Array.from({ length: config.packagePricing.sessions }, (_, i) =>
    addDaysStr(firstDate, i * INTERVAL_DAYS)
  );
}

// Eerste datum van het volgende pakket in hetzelfde ritme.
export function nextPackageFirstDate(pkg: Pick<BookingPackage, "last_date">): string {
  return addDaysStr(pkg.last_date, INTERVAL_DAYS);
}

// Vanaf deze dag kan een andere band de eerste datum van het volgende pakket los boeken
// (losse boekingen kunnen maxWeeksAhead weken vooruit). Wie vóór deze dag verlengt, houdt
// dus zeker hetzelfde slot.
export function renewalDeadline(pkg: Pick<BookingPackage, "last_date">): string {
  return addDaysStr(nextPackageFirstDate(pkg), -config.maxWeeksAhead * 7);
}

function startEndTimes(dagdeelId: string) {
  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId);
  if (!dagdeel) return null;
  const endHour = dagdeel.startHour + config.slotDurationMinutes / 60;
  return {
    start: `${dagdeel.startHour.toString().padStart(2, "0")}:00`,
    end: `${endHour.toString().padStart(2, "0")}:00`,
  };
}

export async function findUnavailableDates(dates: string[], dagdeelId: string): Promise<string[]> {
  const days = await getSlotsForRange(dates[0], dates[dates.length - 1]);
  return dates.filter((date) => {
    const slot = days.find((d) => d.date === date)?.slots.find((s) => s.dagdeelId === dagdeelId);
    return !slot || !slot.available;
  });
}

type CreatePackageInput = {
  bandName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  dagdeelId: string;
  firstDate: string;
  renewalOf?: string | null;
  // "paid" voor een pakket dat de beheerder handmatig invoert (buiten Mollie om betaald).
  initialStatus: "pending" | "paid";
};

export type CreatePackageResult =
  | { ok: true; pkg: BookingPackage; bookings: Booking[] }
  | { ok: false; status: number; error: string; unavailableDates?: string[] };

export async function createPackage(input: CreatePackageInput): Promise<CreatePackageResult> {
  const times = startEndTimes(input.dagdeelId);
  if (!times) return { ok: false, status: 400, error: "Ongeldig dagdeel" };

  const dates = packageDates(input.firstDate);
  const unavailable = await findUnavailableDates(dates, input.dagdeelId);
  if (unavailable.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Niet alle data van dit pakket zijn nog vrij",
      unavailableDates: unavailable,
    };
  }

  const { priceCents, sessions } = config.packagePricing;
  const { data: pkg, error: pkgError } = await supabase
    .from("booking_packages")
    .insert({
      band_name: input.bandName,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone || null,
      dagdeel_id: input.dagdeelId,
      first_date: dates[0],
      last_date: dates[dates.length - 1],
      price_cents: priceCents,
      status: input.initialStatus,
      renewal_of: input.renewalOf ?? null,
    })
    .select()
    .single();

  if (pkgError || !pkg) {
    return { ok: false, status: 500, error: "Er ging iets mis bij het aanmaken van het pakket" };
  }

  // Eén insert voor alle sessies: botst er één op de unieke index (net tegelijk door een
  // ander geboekt), dan faalt het geheel en blijft er niets half staan.
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .insert(
      dates.map((date) => ({
        band_name: input.bandName,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone || null,
        slot_date: date,
        slot_start_time: times.start,
        slot_end_time: times.end,
        // Per sessie het deelbedrag, zodat annuleren van één sessie precies dat deel terugstort.
        price_cents: Math.round(priceCents / sessions),
        status: input.initialStatus === "paid" ? "confirmed" : "pending",
        package_id: pkg.id,
      }))
    )
    .select();

  if (bookingsError || !bookings) {
    await supabase.from("booking_packages").delete().eq("id", pkg.id);
    if (bookingsError?.code === "23505") {
      return { ok: false, status: 409, error: "Een van de data is net door een ander geboekt" };
    }
    return { ok: false, status: 500, error: "Er ging iets mis bij het aanmaken van het pakket" };
  }

  bookings.sort((a, b) => a.slot_date.localeCompare(b.slot_date));
  return { ok: true, pkg, bookings };
}

export async function getPackageBookings(packageId: string): Promise<Booking[]> {
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("package_id", packageId)
    .order("slot_date", { ascending: true });
  return data ?? [];
}
