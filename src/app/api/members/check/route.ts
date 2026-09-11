import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Lichte lookup zodat de front-end al bij het invullen van het e-mailveld kan
// laten zien dat iemand geen lid is, in plaats van pas na het hele formulier
// en een mislukte boekingspoging.
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ isMember: false });
  }

  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .eq("active", true)
    .maybeSingle();

  return NextResponse.json({ isMember: !!data });
}
