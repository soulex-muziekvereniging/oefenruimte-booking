import { NextRequest, NextResponse } from "next/server";
import { getSlotsForRange } from "@/lib/slots";

const MAX_RANGE_DAYS = 70;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "Parameters 'from' en 'to' zijn verplicht (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!datePattern.test(from) || !datePattern.test(to) || isNaN(fromMs) || isNaN(toMs)) {
    return NextResponse.json({ error: "Ongeldige datum (gebruik YYYY-MM-DD)" }, { status: 400 });
  }
  const days = (toMs - fromMs) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Periode moet tussen 0 en ${MAX_RANGE_DAYS} dagen liggen` },
      { status: 400 }
    );
  }

  try {
    const slots = await getSlotsForRange(from, to);
    return NextResponse.json(slots);
  } catch {
    return NextResponse.json(
      { error: "Kon beschikbare tijdslots niet ophalen, probeer het later opnieuw" },
      { status: 500 }
    );
  }
}
