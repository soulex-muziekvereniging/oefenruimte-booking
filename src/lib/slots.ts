import { config } from "@/config";
import { supabase, Booking, Subscription } from "./supabase";
import { toLocalDateStr } from "./date";
import { expireStalePendingBookings } from "./expire";

export type Slot = {
  date: string;
  dagdeelId: string;
  dagdeelLabel: string;
  startTime: string;
  endTime: string;
  available: boolean;
};

export type DaySlots = {
  date: string;
  dayLabel: string;
  slots: Slot[];
};

const DAY_NAMES_NL = [
  "Zondag",
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
];

function formatTime(hours: number): string {
  return `${hours.toString().padStart(2, "0")}:00`;
}


function generateSlotsForDay(date: string): Slot[] {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  if (!config.operatingDays.includes(dayOfWeek)) return [];

  const durationHours = config.slotDurationMinutes / 60;

  return config.dagdelen.map((dagdeel) => ({
    date,
    dagdeelId: dagdeel.id,
    dagdeelLabel: dagdeel.label,
    startTime: formatTime(dagdeel.startHour),
    endTime: formatTime(dagdeel.startHour + durationHours),
    available: true,
  }));
}

export async function getSlotsForRange(
  from: string,
  to: string
): Promise<DaySlots[]> {
  await expireStalePendingBookings();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("slot_date, slot_start_time, status")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    // Nooit stilzwijgend doorgaan alsof alles vrij is - dat riskeert dubbele boekingen.
    throw new Error(`Kon boekingen niet ophalen: ${error.message}`);
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("weekday, dagdeel_id")
    .eq("status", "active");

  if (subscriptionsError) {
    throw new Error(`Kon vaste reserveringen niet ophalen: ${subscriptionsError.message}`);
  }

  // Alleen bezet/vrij naar buiten geven - de bandnaam achter een geboekt slot is
  // niet bedoeld voor anonieme bezoekers van de publieke kalender.
  const bookedSet = new Set<string>(
    (bookings as Pick<Booking, "slot_date" | "slot_start_time">[] | null)?.map(
      (b) => `${b.slot_date}_${b.slot_start_time}`
    ) ?? []
  );

  const subscribedSet = new Set<string>(
    (subscriptions as Pick<Subscription, "weekday" | "dagdeel_id">[] | null)?.map(
      (s) => `${s.weekday}_${s.dagdeel_id}`
    ) ?? []
  );

  const days: DaySlots[] = [];
  const current = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");

  while (current <= end) {
    const dateStr = toLocalDateStr(current);
    const weekday = current.getDay();
    const slots = generateSlotsForDay(dateStr).map((slot) => {
      const key = `${dateStr}_${slot.startTime}:00`;
      const occupied =
        bookedSet.has(key) || subscribedSet.has(`${weekday}_${slot.dagdeelId}`);
      return {
        ...slot,
        available: !occupied,
      };
    });

    days.push({
      date: dateStr,
      dayLabel: DAY_NAMES_NL[current.getDay()],
      slots,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}
