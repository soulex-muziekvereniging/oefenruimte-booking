import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { adminEmailOf } from "@/lib/paymentAdmin";
import { getMaxWeeksAhead, HORIZON_WEEK_OPTIONS, parseHorizonWeeks } from "@/lib/bookingHorizon";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json({ weeks: await getMaxWeeksAhead(), options: HORIZON_WEEK_OPTIONS });
}

// { weeks } -> hoe ver vooruit leden kunnen boeken. Al gemaakte boekingen blijven staan.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const weeks = parseHorizonWeeks(body.weeks);
  if (weeks === null) {
    return NextResponse.json(
      { error: `Kies ${HORIZON_WEEK_OPTIONS.join(", ")} weken` },
      { status: 400 }
    );
  }

  const by = await adminEmailOf(request);
  const old = await getMaxWeeksAhead();
  const { error } = await supabase.from("settings").upsert({
    key: "booking_horizon",
    value: { weeks },
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  if (error) return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  await supabase.from("settings_history").insert({
    key: "booking_horizon",
    old_value: { weeks: old },
    new_value: { weeks },
    changed_by: by,
  });
  return NextResponse.json({ weeks, options: HORIZON_WEEK_OPTIONS });
}
