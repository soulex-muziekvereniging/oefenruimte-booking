import { config } from "@/config";
import { supabase, Booking, Subscription } from "./supabase";
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
  // van de laatst betaalde maand).
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("id, weekday, dagdeel_id, active_until")
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

  const subscriptionsByPattern = new Map<string, Pick<Subscription, "id" | "active_until">>(
    (
      (subscriptions ?? []) as Pick<Subscription, "id" | "weekday" | "dagdeel_id" | "active_until">[]
    ).map((s) => [`${s.weekday}_${s.dagdeel_id}`, s])
  );

  const skippedDates = new Set<string>(
    (swaps ?? []).map((s) => `${s.subscription_id}_${s.original_date}`)
  );
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
      const pattern = `${weekday}_${slot.dagdeelId}`;
      const patternSubscription = subscriptionsByPattern.get(pattern);
      const skippedThisDate =
        !!patternSubscription && skippedDates.has(`${patternSubscription.id}_${dateStr}`);
      const occupiedBySubscription =
        !!patternSubscription &&
        !skippedThisDate &&
        (!patternSubscription.active_until || dateStr <= patternSubscription.active_until);
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

// Komende losse boekingen op een weekdag+dagdeel - die zouden botsen met een nieuwe
// vaste reservering op datzelfde moment.
export async function findConflictingBookingDates(
  weekday: number,
  dagdeelId: string
): Promise<string[]> {
  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId);
  if (!dagdeel) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select("slot_date")
    .in("status", ["pending", "confirmed"])
    .gte("slot_date", todayStr())
    .eq("slot_start_time", `${formatTime(dagdeel.startHour)}:00`);

  if (error) {
    throw new Error(`Kon boekingen niet ophalen: ${error.message}`);
  }

  return (data ?? [])
    .map((b) => b.slot_date as string)
    .filter((date) => new Date(date + "T00:00:00").getDay() === weekday)
    .sort();
}

// Een opgezegde vaste reservering op dit weekdag+dagdeel die nog doorloopt (betaalde
// maand nog niet om). Geeft de laatste dag terug, of null als het slot vrij is.
export async function findRunningOutSubscriptionEnd(
  weekday: number,
  dagdeelId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("active_until")
    .eq("status", "cancelled")
    .eq("weekday", weekday)
    .eq("dagdeel_id", dagdeelId)
    .gte("active_until", todayStr())
    .order("active_until", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Kon vaste reserveringen niet ophalen: ${error.message}`);
  }
  return data?.[0]?.active_until ?? null;
}
