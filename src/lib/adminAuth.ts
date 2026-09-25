import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./adminSession";
import { supabase } from "./supabase";

// Centrale check voor alle /api/admin/* routes: geldig ingelogd via de sessie-cookie
// die /api/admin/login zet. Vervangt het oude gedeelde ADMIN_PASSWORD-wachtwoord.
//
// Ook checken of het account nog bestaat: een verwijderde beheerder mag niet met een
// nog geldige cookie (max 12 uur) door kunnen werken.
export async function verifyAdminPassword(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const adminId = token ? verifySessionToken(token) : null;

  if (!adminId) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", adminId)
    .maybeSingle();
  if (!admin) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  return null;
}

// Id van de ingelogde beheerder (of null) - voor acties waarbij het uitmaakt wie het is,
// zoals voorkomen dat iemand zijn eigen account verwijdert.
export function getAdminId(request: NextRequest): string | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}
