import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("weekday, dagdeel_id, band_name")
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: "Kon beschikbaarheid niet ophalen" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
