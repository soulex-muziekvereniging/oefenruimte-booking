import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { getMailLog } from "@/lib/mailLog";

// Verzendlog van de cron (rekeningen e.d. aan bands) voor de tab Betalingen.
export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json(await getMailLog());
}
