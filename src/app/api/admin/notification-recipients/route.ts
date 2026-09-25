import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("notification_recipients")
    .select("id, email")
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Kon de lijst niet ophalen (is migratie 010 al uitgevoerd?)" },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { email } = await request.json().catch(() => ({}));
  const clean = typeof email === "string" ? email.toLowerCase().trim() : "";
  if (!EMAIL_RE.test(clean)) {
    return NextResponse.json({ error: "Vul een geldig e-mailadres in" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notification_recipients")
    .insert({ email: clean })
    .select("id, email")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "Dit adres staat al in de lijst" : "Toevoegen is niet gelukt" },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }
  return NextResponse.json(data);
}
