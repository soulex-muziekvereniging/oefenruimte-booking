import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { expireStalePendingSubscriptions } from "@/lib/expire";
import { todayStr } from "@/lib/date";

export async function GET() {
  await expireStalePendingSubscriptions();

  // Alleen weekdag/dagdeel teruggeven, niet welke band het heeft - dat is niet
  // bedoeld voor anonieme bezoekers.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("weekday, dagdeel_id")
    // Ook opgezegde reserveringen waarvan de betaalde maand nog loopt.
    .or(`status.eq.active,and(status.eq.cancelled,active_until.gte.${todayStr()})`);

  if (error) {
    return NextResponse.json(
      { error: "Kon beschikbaarheid niet ophalen" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
