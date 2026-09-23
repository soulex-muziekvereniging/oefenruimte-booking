import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { toLocalDateStr } from "@/lib/date";

export async function GET(request: NextRequest) {
  const authError = verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .in("status", ["confirmed", "pending"])
    .gte("slot_date", toLocalDateStr(new Date()))
    .order("slot_date", { ascending: true })
    .order("slot_start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Kon boekingen niet ophalen" }, { status: 500 });
  }

  return NextResponse.json(data);
}
