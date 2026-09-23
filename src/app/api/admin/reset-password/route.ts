import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword, verifyResetToken } from "@/lib/adminSession";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "Vul een nieuw wachtwoord in" },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Wachtwoord moet minstens 8 tekens lang zijn" },
      { status: 400 }
    );
  }

  const email = verifyResetToken(token);
  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  const { error } = await supabase
    .from("admin_users")
    .update({ password_hash: hashPassword(newPassword), updated_at: new Date().toISOString() })
    .ilike("email", email);

  if (error) {
    return NextResponse.json(
      { error: "Kon wachtwoord niet opslaan, probeer het opnieuw" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
