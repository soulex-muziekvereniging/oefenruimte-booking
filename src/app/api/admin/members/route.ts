import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { bandHasOtherPhone, cleanPhone } from "@/lib/memberPhones";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Kon leden niet ophalen" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json();
  const { name, email } = body;
  const phone = cleanPhone(body.phone);

  if (!name || !email) {
    return NextResponse.json(
      { error: "Naam en e-mailadres zijn verplicht" },
      { status: 400 }
    );
  }

  if (!phone && !(await bandHasOtherPhone(name))) {
    return NextResponse.json(
      { error: "Vul een telefoonnummer in - elke band heeft er minstens één nodig" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("members")
    .insert({ name, email: email.toLowerCase().trim(), phone, active: true })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Dit e-mailadres staat al op de ledenlijst" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Kon lid niet toevoegen" }, { status: 500 });
  }

  return NextResponse.json(data);
}
