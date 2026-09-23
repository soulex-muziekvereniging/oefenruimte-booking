import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./adminSession";

// Centrale check voor alle /api/admin/* routes: geldig ingelogd via de sessie-cookie
// die /api/admin/login zet. Vervangt het oude gedeelde ADMIN_PASSWORD-wachtwoord.
export function verifyAdminPassword(request: NextRequest): NextResponse | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const adminId = token ? verifySessionToken(token) : null;

  if (!adminId) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  return null;
}
