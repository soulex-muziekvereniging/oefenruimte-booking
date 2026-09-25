import { NextRequest, NextResponse } from "next/server";
import { expireStalePendingSubscriptions } from "@/lib/expire";
import { findSubscriptionConflict } from "@/lib/slots";
import { checkStartDate, conflictMessage, parseSubscriptionInput } from "@/lib/subscriptionRequest";
import { occurrencesBetween, weekdayOf } from "@/lib/schedule";
import { addDaysStr } from "@/lib/periods";

// Live check voor het aanvraagformulier: kan een vaste reservering met deze startdatum,
// dit dagdeel en dit ritme? Geeft nooit door welke band een moment bezet heeft.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = parseSubscriptionInput(params);
  if (!parsed.ok) {
    return NextResponse.json({ available: false, message: parsed.error }, { status: 400 });
  }
  const input = parsed.value;

  const startError = checkStartDate(input);
  if (startError) {
    return NextResponse.json({ available: false, message: startError });
  }

  await expireStalePendingSubscriptions();

  try {
    const conflict = await findSubscriptionConflict({
      dagdeel_id: input.dagdeelId,
      frequency: input.frequency,
      start_date: input.startDate,
    });
    const firstDates = occurrencesBetween(
      {
        weekday: weekdayOf(input.startDate),
        dagdeel_id: input.dagdeelId,
        frequency: input.frequency,
        start_date: input.startDate,
      },
      input.startDate,
      addDaysStr(input.startDate, 7 * 8)
    ).slice(0, 4);

    return NextResponse.json(
      conflict
        ? { available: false, message: conflictMessage(conflict), firstDates }
        : { available: true, firstDates }
    );
  } catch {
    return NextResponse.json(
      { available: false, message: "Kon beschikbaarheid niet controleren, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
