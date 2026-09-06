import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .in("status", ["confirmed", "pending"])
    .gte("slot_date", new Date().toISOString().split("T")[0])
    .order("slot_date", { ascending: true })
    .order("slot_start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Kon boekingen niet ophalen" }, { status: 500 });
  }

  return NextResponse.json(data);
}
