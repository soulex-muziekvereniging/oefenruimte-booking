import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase, type Subscription, type SubscriptionPayment } from "@/lib/supabase";
import { getTariffs, subscriptionPrice } from "@/lib/tariffs";
import { parseDiscountPercent } from "@/lib/tariffDefaults";
import { sessionPriceCents } from "@/lib/billing";
import { isPaymentInProgress } from "@/lib/mollie";
import { getActiveMemberEmails } from "@/lib/members";
import { sendPeriodPaymentRequestEmail } from "@/lib/email";
import { appendMailLog, type MailLogEntry } from "@/lib/mailLog";
import { adminEmailOf, cleanNote, todayLabel, updateUnpaidPeriod } from "@/lib/paymentAdmin";

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// Korting op een vaste plek aan- of uitzetten (bijv. halve prijs voor een korte repetitie).
// Body: { percent: 0-100, note, applyToOpen }. De korting geldt voor de repetities, niet voor
// de opslag, en gaat in vanaf de volgende rekening. Met applyToOpen wordt ook een al
// verstuurde, nog niet betaalde rekening aangepast; de band krijgt dan een aangepaste
// rekening (de betaallink blijft dezelfde en rekent het nieuwe bedrag).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const percent = parseDiscountPercent(body.percent);
  if (percent === null) {
    return NextResponse.json({ error: "Kies een korting van 0 tot 100%" }, { status: 400 });
  }
  const note = percent > 0 ? cleanNote(body.note, 120) : "";

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle<Subscription>();
  if (!subscription || !["active", "pending_first_payment"].includes(subscription.status)) {
    return NextResponse.json({ error: "Alleen bij een lopende vaste reservering" }, { status: 400 });
  }
  if (subscription.discount_percent === undefined) {
    return NextResponse.json(
      { error: "Korting kan nog niet: migratie 023 is nog niet uitgevoerd" },
      { status: 500 }
    );
  }

  // Het volle bedrag voor de repetities halen we uit het huidige bedrag van deze band (dat
  // kan een ouder tarief zijn als een tariefwijziging niet op bestaande plekken is toegepast).
  // Alleen bij 100% korting valt dat niet terug te rekenen: dan het huidige tarief.
  const tariffs = await getTariffs();
  const storage = subscription.storage_unit ? tariffs.storageCents : 0;
  const oldPercent = subscription.discount_percent;
  const fullRehearsals =
    oldPercent < 100
      ? Math.round(((subscription.price_cents - storage) * 100) / (100 - oldPercent))
      : subscriptionPrice(tariffs, subscription.frequency, false);
  const newPrice = Math.round((fullRehearsals * (100 - percent)) / 100) + storage;

  const { data: updated, error } = await supabase
    .from("subscriptions")
    .update({
      discount_percent: percent,
      discount_note: note || null,
      price_cents: newPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single<Subscription>();
  if (error || !updated) {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }

  const result = { priceCents: newPrice, adjusted: [] as string[], skipped: [] as string[] };
  if (body.applyToOpen !== true || percent === oldPercent) return NextResponse.json(result);

  // Al gemaakte, nog niet betaalde rekeningen van deze plek opnieuw uitrekenen.
  const { data: open } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("subscription_id", id)
    .eq("status", "unpaid");
  const by = await adminEmailOf(request);
  const correction =
    percent > 0
      ? `Jullie krijgen ${percent}% korting op de repetities${note ? ` (${note})` : ""}.`
      : "De korting op de repetities is vervallen.";
  const log: MailLogEntry[] = [];

  for (const p of (open ?? []) as SubscriptionPayment[]) {
    const period = `${p.period_start} t/m ${p.period_end}`;
    if (typeof p.sessions_held !== "number") {
      result.skipped.push(`${period}: oude rekening zonder regels, pas hem met de hand aan`);
      continue;
    }
    if (await isPaymentInProgress(p.mollie_payment_id)) {
      result.skipped.push(`${period}: de band is net aan het betalen`);
      continue;
    }
    const sessionPrice = sessionPriceCents(updated, tariffs);
    const subtotal = p.sessions_held * sessionPrice + (p.storage_cents ?? 0);
    const credit = p.credit_cents ?? 0;
    if (credit > subtotal) {
      result.skipped.push(`${period}: er is meer tegoed verrekend dan het nieuwe bedrag`);
      continue;
    }
    const amount = subtotal - credit;
    if (amount === p.amount_cents) continue;

    const nothingToPay = amount === 0;
    const row = await updateUnpaidPeriod(
      p.id,
      {
        amount_cents: amount,
        session_price_cents: sessionPrice,
        ...(nothingToPay ? { status: "waived" } : {}),
      },
      `Bedrag aangepast door korting (was ${formatPrice(p.amount_cents)}; ${by}, ${todayLabel()})`
    );
    if (!row) {
      result.skipped.push(`${period}: kon niet worden aangepast`);
      continue;
    }
    result.adjusted.push(`${period}: ${formatPrice(p.amount_cents)} → ${formatPrice(amount)}`);

    // Alleen een nieuwe mail als de band de oude rekening al had; anders gaat hij vanzelf.
    if (nothingToPay || !p.invoice_sent_at) continue;
    const bandEmails = await getActiveMemberEmails(updated.band_name, updated.contact_email);
    const entry: MailLogEntry = {
      at: new Date().toISOString(),
      kind: "rekening",
      band: updated.band_name,
      period,
      to: Array.from(new Set([updated.contact_email, ...bandEmails])),
      ok: true,
    };
    try {
      await sendPeriodPaymentRequestEmail(updated, row as SubscriptionPayment, bandEmails, correction);
      await supabase
        .from("subscription_payments")
        .update({ invoice_sent_at: new Date().toISOString() })
        .eq("id", p.id);
    } catch (err) {
      entry.ok = false;
      entry.error = err instanceof Error ? err.message : String(err);
      result.skipped.push(`${period}: aangepaste rekening kon niet worden gemaild`);
    }
    log.push(entry);
  }
  await appendMailLog(log);
  return NextResponse.json(result);
}
