import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("status", { ascending: true })
    .order("weekday", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Kon vaste reserveringen niet ophalen" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
