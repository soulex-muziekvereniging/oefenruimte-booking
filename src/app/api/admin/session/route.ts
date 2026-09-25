import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";

// Lichte check of de sessie-cookie nog geldig is, gebruikt door /admin bij het laden
// om te bepalen of het inlogscherm of het dashboard getoond moet worden.
export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json({ success: true });
}
