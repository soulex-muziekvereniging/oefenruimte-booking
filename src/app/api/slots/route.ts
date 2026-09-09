import { NextRequest, NextResponse } from "next/server";
import { getSlotsForRange } from "@/lib/slots";

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
