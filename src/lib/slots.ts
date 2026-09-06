import { config } from "@/config";
import { supabase, Booking } from "./supabase";

export type Slot = {
  date: string;
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

  const slots: Slot[] = [];
  const { start, end } = config.operatingHours;
  const durationHours = config.slotDurationMinutes / 60;

  for (let hour = start; hour + durationHours <= end; hour += durationHours) {
    slots.push({
      date,
      startTime: formatTime(hour),
      endTime: formatTime(hour + durationHours),
      available: true,
    });
  }

  return slots;
}

export async function getSlotsForRange(
  from: string,
  to: string
): Promise<DaySlots[]> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("slot_date, slot_start_time, status")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .in("status", ["pending", "confirmed"]);

  const bookedSet = new Set(
    (bookings as Pick<Booking, "slot_date" | "slot_start_time">[] | null)?.map(
      (b) => `${b.slot_date}_${b.slot_start_time}`
    ) ?? []
  );

  const days: DaySlots[] = [];
  const current = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];
    const slots = generateSlotsForDay(dateStr).map((slot) => ({
      ...slot,
      available: !bookedSet.has(`${dateStr}_${slot.startTime}:00`),
    }));

    days.push({
      date: dateStr,
      dayLabel: DAY_NAMES_NL[current.getDay()],
      slots,
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}
