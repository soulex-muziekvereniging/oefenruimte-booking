import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getTariffs, parseTariffs, subscriptionPrice, TARIFF_LABELS, type Tariffs } from "@/lib/tariffs";
import { sendTariffChangeEmail, sendSafely } from "@/lib/email";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data: history } = await supabase
    .from("settings_history")
    .select("old_value, new_value, changed_by, changed_at")
    .eq("key", "tariffs")
    .order("changed_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ tariffs: await getTariffs(), history: history ?? [] });
}

// Nieuwe tarieven opslaan. Gelden meteen voor nieuwe boekingen en nieuwe vaste
// reserveringen; met applyToExisting ook voor lopende vaste reserveringen, vanaf hun
// volgende betaalverzoek (al verstuurde betaalverzoeken blijven zoals ze zijn).
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const parsed = parseTariffs(body.tariffs);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const tariffs = parsed.value;
  const old = await getTariffs();

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const changedBy = admin?.email ?? "onbekend";

  const { error } = await supabase.from("settings").upsert({
    key: "tariffs",
    value: tariffs,
    updated_at: new Date().toISOString(),
    updated_by: changedBy,
  });
  if (error) {
    return NextResponse.json(
      { error: "Opslaan is niet gelukt (is migratie 015 al uitgevoerd?)" },
      { status: 500 }
    );
  }

  await supabase.from("settings_history").insert({
    key: "tariffs",
    old_value: old,
    new_value: tariffs,
    changed_by: changedBy,
  });

  let updatedSubscriptions = 0;
  if (body.applyToExisting === true) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, frequency, storage_unit, price_cents")
      .in("status", ["active", "pending_first_payment"]);
    for (const sub of subs ?? []) {
      const newPrice = subscriptionPrice(tariffs, sub.frequency, !!sub.storage_unit);
      if (newPrice === sub.price_cents) continue;
      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({ price_cents: newPrice, updated_at: new Date().toISOString() })
        .eq("id", sub.id);
      if (!updateError) updatedSubscriptions++;
    }
  }

  // Alle beheerders krijgen een bevestiging, zodat een (onbedoelde) wijziging opvalt.
  const changes = (Object.keys(TARIFF_LABELS) as (keyof Tariffs)[])
    .filter((k) => old[k] !== tariffs[k])
    .map((k) => ({ label: TARIFF_LABELS[k], oldCents: old[k], newCents: tariffs[k] }));
  if (changes.length > 0) {
    const { data: admins } = await supabase.from("admin_users").select("email");
    const adminEmails = (admins ?? []).map((a) => a.email as string);
    if (adminEmails.length > 0) {
      await sendSafely("melding tariefwijziging", () =>
        sendTariffChangeEmail(adminEmails, changedBy, changes, body.applyToExisting === true, updatedSubscriptions)
      );
    }
  }

  return NextResponse.json({ tariffs, updatedSubscriptions });
}
