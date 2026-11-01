import { NextResponse } from "next/server";
import { getMaxWeeksAhead } from "@/lib/bookingHorizon";

// Publiek: hoeveel weken vooruit leden kunnen boeken (kalender en formulieren).
export async function GET() {
  return NextResponse.json({ weeks: await getMaxWeeksAhead() });
}
