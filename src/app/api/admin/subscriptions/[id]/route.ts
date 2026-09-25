import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { getFreeStorageUnits } from "@/lib/storage";

// Definitief opruimen van een opgezegde of vervallen vaste reservering, inclusief de
// bijbehorende betaalperiodes en ruilingen. Actieve reserveringen eerst opzeggen.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("id", id)
    .single();

  if (!subscription) {
    return NextResponse.json({ error: "Vaste reservering niet gevonden" }, { status: 404 });
  }

  if (subscription.status !== "cancelled" && subscription.status !== "lapsed") {
    return NextResponse.json(
      { error: "Alleen opgezegde of vervallen vaste reserveringen kunnen verwijderd worden" },
      { status: 400 }
    );
  }

  const { error: swapsError } = await supabase
    .from("subscription_swaps")
    .delete()
    .eq("subscription_id", id);
  const { error: paymentsError } = await supabase
    .from("subscription_payments")
    .delete()
    .eq("subscription_id", id);

  if (swapsError || paymentsError) {
    return NextResponse.json({ error: "Kon vaste reservering niet verwijderen" }, { status: 500 });
  }

  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Kon vaste reservering niet verwijderen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Opslagruimte toekennen, wisselen of weghalen bij een lopende vaste reservering. De prijs
// per 4 weken gaat mee omhoog/omlaag en geldt vanaf het volgende betaalverzoek.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const storageUnit: string | null =
    typeof body.storageUnit === "string" && body.storageUnit ? body.storageUnit : null;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status, storage_unit, price_cents")
    .eq("id", id)
    .maybeSingle();

  if (!subscription || !["active", "pending_first_payment"].includes(subscription.status)) {
    return NextResponse.json(
      { error: "Alleen bij een lopende vaste reservering" },
      { status: 400 }
    );
  }

  if (storageUnit) {
    if (!config.storage.units.includes(storageUnit)) {
      return NextResponse.json({ error: "Onbekende opslagruimte" }, { status: 400 });
    }
    if (!(await getFreeStorageUnits(id)).includes(storageUnit)) {
      return NextResponse.json(
        { error: `Opslagruimte ${storageUnit} is al in gebruik` },
        { status: 409 }
      );
    }
  }

  const priceDelta =
    (storageUnit ? config.storage.priceCentsPerPeriod : 0) -
    (subscription.storage_unit ? config.storage.priceCentsPerPeriod : 0);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      storage_unit: storageUnit,
      price_cents: subscription.price_cents + priceDelta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
