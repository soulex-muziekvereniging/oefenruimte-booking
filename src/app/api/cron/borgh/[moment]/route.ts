import { NextRequest, NextResponse } from "next/server";
import { sendBorghMail } from "@/lib/borghSync";

// Ochtendronde voor De Borgh (zie vercel.json): alles wat sinds gisteren is vrijgekomen in
// één mail, als automatisch mailen aan staat in beheer > Zalenplanner. Annuleringen voor
// dezelfde dag zijn dan al meteen gemaild (noteBorghChanges).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendBorghMail("alles"));
  } catch (err) {
    console.error("[zalenplanner] ochtendmail aan De Borgh mislukt:", err);
    return NextResponse.json({ error: "Versturen mislukt" }, { status: 500 });
  }
}
