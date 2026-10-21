import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getInvoicing, type InvoicingSetting } from "@/lib/invoicing";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json(await getInvoicing());
}

// Rekeningen aan- of uitzetten, met de datum vanaf wanneer gefactureerd wordt.
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Aan of uit?" }, { status: 400 });
  }
  const fromDate: string | null =
    typeof body.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : null;
  if (body.enabled && !fromDate) {
    return NextResponse.json({ error: "Kies vanaf welke datum er gefactureerd wordt" }, { status: 400 });
  }

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const changedBy = admin?.email ?? "onbekend";
  const old = await getInvoicing();
  const value: InvoicingSetting = { enabled: body.enabled, fromDate };

  const { error } = await supabase.from("settings").upsert({
    key: "invoicing",
    value,
    updated_at: new Date().toISOString(),
    updated_by: changedBy,
  });
  if (error) return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  await supabase.from("settings_history").insert({
    key: "invoicing",
    old_value: old,
    new_value: value,
    changed_by: changedBy,
  });
  return NextResponse.json(value);
}
