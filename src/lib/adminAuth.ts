import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "./rateLimit";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuten

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Centrale check voor alle /api/admin/* routes: 1 gedeeld wachtwoord (ADMIN_PASSWORD),
// timing-safe vergeleken, met een pogingslimiet per IP om brute-forcen te ontmoedigen.
export function verifyAdminPassword(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);
  if (isRateLimited(`admin:${ip}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Te veel pogingen, probeer het over 15 minuten opnieuw" },
      { status: 429 }
    );
  }

  const password = request.headers.get("x-admin-password");
  if (!password || !timingSafeEqual(password, process.env.ADMIN_PASSWORD!)) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  return null;
}
