import { config } from "@/config";
import { supabase, Booking } from "./supabase";
import { occursOn, patternsCollide, SubscriptionPattern, weekdayOf } from "./schedule";
import { toLocalDateStr, todayStr } from "./date";
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

  // Ook een aanvraag die nog op de eerste betaling wacht houdt het weekdag+dagdeel al
  // vast - anders kan iemand er in die minuten een losse boeking tussen schuiven.
  // Een opgezegde reservering houdt het slot nog vast tot en met active_until (het einde
  // van de laatst betaalde periode).
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("id, weekday, dagdeel_id, frequency, start_date, active_until")
    .or(
      `status.in.(active,pending_first_payment),and(status.eq.cancelled,active_until.gte.${from})`
    );

  if (subscriptionsError) {
    throw new Error(`Kon vaste reserveringen niet ophalen: ${subscriptionsError.message}`);
  }

  const subscriptionIds = (subscriptions ?? []).map((s) => s.id);

  // Schuiven (zie subscription_swaps): een specifieke datum kan zijn overgeslagen
  // (weer gewoon los boekbaar) en/of een andere datum kan juist bezet zijn geraakt
  // doordat een band daar structureel naartoe is geschoven deze periode.
  const { data: swaps, error: swapsError } =
    subscriptionIds.length > 0
      ? await supabase
          .from("subscription_swaps")
          .select("subscription_id, original_date, new_date, new_dagdeel_id")
          .in("subscription_id", subscriptionIds)
          .or(
            `and(original_date.gte.${from},original_date.lte.${to}),and(new_date.gte.${from},new_date.lte.${to})`
          )
      : { data: [], error: null };

  if (swapsError) {
    throw new Error(`Kon geruilde repetities niet ophalen: ${swapsError.message}`);
  }

  // Alleen bezet/vrij naar buiten geven - de bandnaam achter een geboekt slot is
  // niet bedoeld voor anonieme bezoekers van de publieke kalender.
  const bookedSet = new Set<string>(
    (bookings as Pick<Booking, "slot_date" | "slot_start_time">[] | null)?.map(
      (b) => `${b.slot_date}_${b.slot_start_time}`
    ) ?? []
  );

  const skippedDates = new Set<string>(
    (swaps ?? []).map((s) => `${s.subscription_id}_${s.original_date}`)
  );
  const activePatterns = (subscriptions ?? []) as (SubscriptionPattern & { id: string })[];

  const movedInSet = new Set<string>(
    (swaps ?? [])
      .filter((s) => s.new_date && s.new_dagdeel_id)
      .map((s) => `${s.new_date}_${s.new_dagdeel_id}`)
  );

  const days: DaySlots[] = [];
  const current = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");

  while (current <= end) {
    const dateStr = toLocalDateStr(current);
    const weekday = current.getDay();
    const slots = generateSlotsForDay(dateStr).map((slot) => {
      const key = `${dateStr}_${slot.startTime}:00`;
      // Een vaste reservering bezet dit dagdeel als het ritme op deze datum valt, tenzij
      // de band juist deze keer heeft verplaatst.
      const occupiedBySubscription = activePatterns.some(
        (sub) =>
          sub.weekday === weekday &&
          sub.dagdeel_id === slot.dagdeelId &&
          occursOn(sub, dateStr) &&
          !skippedDates.has(`${sub.id}_${dateStr}`)
      );
      const occupied =
        bookedSet.has(key) ||
        occupiedBySubscription ||
        movedInSet.has(`${dateStr}_${slot.dagdeelId}`);
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

// Kan er een nieuwe vaste reservering met dit ritme bij? Botst die met losse boekingen
// (vanaf de startdatum) of met een andere vaste reservering - ook een opgezegde die nog
// doorloopt tot het einde van de betaalde periode?
export type SubscriptionConflict =
  | { kind: "bookings"; dates: string[] }
  | { kind: "subscription"; freeFrom: string | null }
  | null;

export async function findSubscriptionConflict(
  pattern: Omit<SubscriptionPattern, "weekday" | "active_until">,
  excludeSubscriptionId?: string
): Promise<SubscriptionConflict> {
  const dagdeel = config.dagdelen.find((d) => d.id === pattern.dagdeel_id);
  if (!dagdeel) return null;
  const candidate: SubscriptionPattern = { ...pattern, weekday: weekdayOf(pattern.start_date) };

  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("id, weekday, dagdeel_id, frequency, start_date, active_until, status")
    .eq("weekday", candidate.weekday)
    .eq("dagdeel_id", candidate.dagdeel_id)
    .or(
      `status.in.(active,pending_first_payment),and(status.eq.cancelled,active_until.gte.${todayStr()})`
    );
  if (subsError) {
    throw new Error(`Kon vaste reserveringen niet ophalen: ${subsError.message}`);
  }

  const clashing = ((subs ?? []) as (SubscriptionPattern & { id: string; status: string })[]).filter(
    (s) => s.id !== excludeSubscriptionId && patternsCollide(candidate, s)
  );
  if (clashing.length > 0) {
    // Alleen aflopende (opgezegde) reserveringen in de weg: dan is het slot later vrij.
    const allRunningOut = clashing.every((s) => s.status === "cancelled" && s.active_until);
    const freeFrom = allRunningOut
      ? clashing
          .map((s) => s.active_until as string)
          .sort()
          .at(-1)!
      : null;
    return { kind: "subscription", freeFrom };
  }

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("slot_date")
    .in("status", ["pending", "confirmed"])
    .gte("slot_date", candidate.start_date)
    .eq("slot_start_time", `${formatTime(dagdeel.startHour)}:00`);
  if (error) {
    throw new Error(`Kon boekingen niet ophalen: ${error.message}`);
  }

  const dates = (bookings ?? [])
    .map((b) => b.slot_date as string)
    .filter((date) => occursOn(candidate, date))
    .sort();
  return dates.length > 0 ? { kind: "bookings", dates } : null;
}
