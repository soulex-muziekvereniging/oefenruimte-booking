import { NextRequest, NextResponse } from "next/server";
import { sendPendingBorghMail } from "@/lib/borghSync";
import { sendBorghFreedEmail } from "@/lib/email";

// Automatisch aan De Borgh doorgeven dat de oefenruimte vrijkomt (als dat aan staat in
// beheer > Zalenplanner). Draait een paar keer per dag (zie vercel.json; Vercel Hobby
// staat per cronjob maar één run per dag toe, vandaar één pad per moment). Elke run
// verstuurt hooguit één mail met alles wat langer dan de wachttijd klaarstaat.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendPendingBorghMail(sendBorghFreedEmail));
  } catch (err) {
    console.error("[zalenplanner] automatische mail aan De Borgh mislukt:", err);
    return NextResponse.json({ error: "Versturen mislukt" }, { status: 500 });
  }
}
