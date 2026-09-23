import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authError = verifyAdminPassword(request);
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
  const authError = verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json();
  const { name, email } = body;

  if (!name || !email) {
    return NextResponse.json(
      { error: "Naam en e-mailadres zijn verplicht" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("members")
    .insert({ name, email: email.toLowerCase().trim(), active: true })
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
