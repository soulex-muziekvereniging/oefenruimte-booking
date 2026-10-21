import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import {
  CANCEL_HOUR_OPTIONS,
  getPaymentTerms,
  GRACE_MAX_DAYS,
  GRACE_MIN_DAYS,
  parseCancelHours,
  parseGraceDays,
  type PaymentTerms,
} from "@/lib/paymentTerms";

function response(terms: PaymentTerms) {
  return NextResponse.json({
    ...terms,
    min: GRACE_MIN_DAYS,
    max: GRACE_MAX_DAYS,
    cancelOptions: CANCEL_HOUR_OPTIONS,
  });
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return response(await getPaymentTerms());
}

// Vervaltermijn en/of afmeldtermijn wijzigen. De vervaltermijn geldt voor rekeningen die
// vanaf nu verstuurd worden; al verstuurde rekeningen houden hun eigen termijn.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const old = await getPaymentTerms();
  const graceDays = body.graceDays === undefined ? old.graceDays : parseGraceDays(body.graceDays);
  const cancelHours = body.cancelHours === undefined ? old.cancelHours : parseCancelHours(body.cancelHours);
  if (graceDays === null) {
    return NextResponse.json(
      { error: `Kies een vervaltermijn van ${GRACE_MIN_DAYS} tot ${GRACE_MAX_DAYS} dagen` },
      { status: 400 }
    );
  }
  if (cancelHours === null) {
    return NextResponse.json(
      { error: `Kies een afmeldtermijn van ${CANCEL_HOUR_OPTIONS.join(", ")} uur` },
      { status: 400 }
    );
  }

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const changedBy = admin?.email ?? "onbekend";
  const terms: PaymentTerms = { graceDays, cancelHours };

  const { error } = await supabase.from("settings").upsert({
    key: "payment_terms",
    value: terms,
    updated_at: new Date().toISOString(),
    updated_by: changedBy,
  });
  if (error) {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
  await supabase.from("settings_history").insert({
    key: "payment_terms",
    old_value: old,
    new_value: terms,
    changed_by: changedBy,
  });

  return response(terms);
}
