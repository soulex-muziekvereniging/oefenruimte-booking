import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Beheerders-accounts. Nooit de wachtwoord-hash naar buiten geven, alleen of er al een
// wachtwoord is ingesteld.
export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, password_hash")
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Kon beheerders niet ophalen" }, { status: 500 });
  }

  const me = getAdminId(request);
  return NextResponse.json(
    (data ?? []).map((a) => ({
      id: a.id,
      email: a.email,
      hasPassword: !!a.password_hash,
      isMe: a.id === me,
    }))
  );
}

// Nieuwe beheerder: zonder wachtwoord. Die stelt het zelf in via "Wachtwoord vergeten"
// op /admin/login; de link komt in de eigen mailbox.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { email } = await request.json().catch(() => ({}));
  const clean = typeof email === "string" ? email.toLowerCase().trim() : "";
  if (!EMAIL_RE.test(clean)) {
    return NextResponse.json({ error: "Vul een geldig e-mailadres in" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("admin_users")
    .insert({ email: clean })
    .select("id, email")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "Dit is al een beheerder" : "Toevoegen is niet gelukt" },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }
  return NextResponse.json({ ...data, hasPassword: false, isMe: false });
}
