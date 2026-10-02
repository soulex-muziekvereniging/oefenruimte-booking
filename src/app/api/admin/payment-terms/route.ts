import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getGraceDays, GRACE_MAX_DAYS, GRACE_MIN_DAYS, parseGraceDays } from "@/lib/paymentTerms";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json({
    graceDays: await getGraceDays(),
    min: GRACE_MIN_DAYS,
    max: GRACE_MAX_DAYS,
  });
}

// Vervaltermijn wijzigen. Geldt voor betaalperiodes die vanaf nu worden klaargezet; al
// verstuurde betaalverzoeken houden hun eigen termijn.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const graceDays = parseGraceDays(body.graceDays);
  if (graceDays === null) {
    return NextResponse.json(
      { error: `Kies een termijn van ${GRACE_MIN_DAYS} tot ${GRACE_MAX_DAYS} dagen` },
      { status: 400 }
    );
  }

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const changedBy = admin?.email ?? "onbekend";
  const old = await getGraceDays();

  const { error } = await supabase.from("settings").upsert({
    key: "payment_terms",
    value: { graceDays },
    updated_at: new Date().toISOString(),
    updated_by: changedBy,
  });
  if (error) {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
  await supabase.from("settings_history").insert({
    key: "payment_terms",
    old_value: { graceDays: old },
    new_value: { graceDays },
    changed_by: changedBy,
  });

  return NextResponse.json({ graceDays, min: GRACE_MIN_DAYS, max: GRACE_MAX_DAYS });
}
