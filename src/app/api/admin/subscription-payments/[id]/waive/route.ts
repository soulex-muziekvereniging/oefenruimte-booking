import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Handmatige "pauzeperiode"-hendel (besluit bestuur 2026-09-11): deze maand hoeft niet
// betaald te worden, maar het tijdslot blijft gewoon van de band. Bewust geen
// geautomatiseerde regel/limiet - het bestuur beoordeelt dit per geval.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("subscription_payments")
    .update({ status: "waived", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "unpaid")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Kon deze periode niet kwijtschelden" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
