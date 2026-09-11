import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data, error } = await supabase.from("subscription_swaps").select("*");

  if (error) {
    return NextResponse.json({ error: "Kon geruilde repetities niet ophalen" }, { status: 500 });
  }

  return NextResponse.json(data);
}
