import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { expireStalePendingSubscriptions } from "@/lib/expire";

export async function GET() {
  await expireStalePendingSubscriptions();

  // Alleen weekdag/dagdeel teruggeven, niet welke band het heeft - dat is niet
  // bedoeld voor anonieme bezoekers.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("weekday, dagdeel_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: "Kon beschikbaarheid niet ophalen" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
