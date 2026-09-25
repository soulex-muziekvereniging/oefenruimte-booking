import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSessionToken, verifyPassword, SESSION_COOKIE } from "@/lib/adminSession";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuten

export async function POST(request: NextRequest) {
  if (isRateLimited(`admin-login:${getClientIp(request)}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Te veel pogingen, probeer het over 15 minuten opnieuw" },
      { status: 429 }
    );
  }

  try {
    return await login(request);
  } catch (err) {
    // Zonder deze vangnet krijgt de beheerder alleen "Er ging iets mis" te zien en is de
    // oorzaak niet terug te vinden - nu staat hij in de Vercel-logs én in de melding.
    console.error("[admin-login] onverwachte fout:", err);
    return NextResponse.json(
      { error: `Inloggen mislukt door een serverfout: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

async function login(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, password } = body;

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json(
      { error: "Vul e-mailadres en wachtwoord in" },
      { status: 400 }
    );
  }

  const { data: admin, error: lookupError } = await supabase
    .from("admin_users")
    .select("id, password_hash")
    .ilike("email", email.trim())
    .maybeSingle();

  if (lookupError) throw new Error(`database: ${lookupError.message}`);

  if (!admin || !admin.password_hash || !verifyPassword(password, admin.password_hash)) {
    return NextResponse.json({ error: "Ongeldig e-mailadres of wachtwoord" }, { status: 401 });
  }

  const token = createSessionToken(admin.id);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 uur, zelfde als de sessie-TTL
  });
  return response;
}
