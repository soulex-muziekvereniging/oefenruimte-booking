import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { adminEmailOf, cleanNote, todayLabel, updateUnpaidPeriod } from "@/lib/paymentAdmin";

// Handmatige "pauzeperiode"-hendel (besluit bestuur 2026-09-11): deze periode hoeft niet
// betaald te worden, maar het tijdslot blijft gewoon van de band. Bewust geen
// geautomatiseerde regel/limiet - het bestuur beoordeelt dit per geval.
// Ook te gebruiken voor een openstaande periode van een opgezegde of vervallen reservering
// (tab Betalingen). Optioneel { reason }; wie en wanneer wordt erbij bewaard.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const reason = cleanNote(body.reason);
  const by = await adminEmailOf(request);
  const note = `Kwijtgescholden${reason ? `: ${reason}` : ""} (${by}, ${todayLabel()})`;

  const data = await updateUnpaidPeriod(
    id,
    { status: "waived", updated_at: new Date().toISOString() },
    note
  );
  if (!data) {
    return NextResponse.json(
      { error: "Kon deze periode niet kwijtschelden (al betaald of al afgehandeld?)" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
