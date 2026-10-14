import { NextRequest, NextResponse } from "next/server";
import { getTariffs, subscriptionPrice } from "@/lib/tariffs";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { expireStalePendingSubscriptions } from "@/lib/expire";
import { findSubscriptionConflict } from "@/lib/slots";
import { weekdayOf } from "@/lib/schedule";
import { getActiveMemberEmails } from "@/lib/members";
import {
  sendSafely,
  sendSubscriptionConfirmationEmail,
  sendSubscriptionNotificationToOrg,
} from "@/lib/email";
import { checkStartDate, conflictMessage, parseSubscriptionInput } from "@/lib/subscriptionRequest";
import { getFreeStorageUnits, getOccupiedStorageUnits } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { bandName, contactName, contactEmail, contactPhone } = body;
  const wantsStorage = body.storage === true;

  if (!bandName || !contactName || !contactEmail) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  const parsed = parseSubscriptionInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { startDate, dagdeelId, frequency } = parsed.value;
  const startError = checkStartDate(parsed.value);
  if (startError) {
    return NextResponse.json({ error: startError }, { status: 400 });
  }

  await expireStalePendingSubscriptions();

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", contactEmail.toLowerCase().trim())
    .eq("active", true)
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      {
        error: `Dit e-mailadres staat niet geregistreerd als lid van ${config.organizationName}. Neem contact op om lid te worden voordat je kan boeken.`,
      },
      { status: 403 }
    );
  }

  const conflict = await findSubscriptionConflict({
    dagdeel_id: dagdeelId,
    frequency,
    start_date: startDate,
  });
  if (conflict) {
    return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });
  }

  // Opslagruimte: de eerste vrije toewijzen. Vol is vol.
  let storageUnit: string | null = null;
  if (wantsStorage) {
    const free = await getFreeStorageUnits();
    if (free.length === 0) {
      return NextResponse.json(
        { error: "De opslagruimtes zijn helaas allemaal verhuurd. Vraag de reservering aan zonder opslag." },
        { status: 409 }
      );
    }
    storageUnit = free[0];
  }

  const priceCents = subscriptionPrice(await getTariffs(), frequency, !!storageUnit);

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      band_name: bandName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      weekday: weekdayOf(startDate),
      dagdeel_id: dagdeelId,
      frequency,
      start_date: startDate,
      price_cents: priceCents,
      storage_unit: storageUnit,
      // Achteraf betalen: de vaste plek is meteen actief, de eerste rekening komt na de
      // eerste periode van 4 weken (cron /api/cron/subscriptions). Alleen leden kunnen
      // aanvragen (hierboven gecontroleerd).
      status: "active",
      term_start_date: startDate,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Er ging iets mis bij het aanmaken van de vaste reservering" },
      { status: 500 }
    );
  }

  // Nog een keer checken ná het opslaan: vangt twee aanvragen die tegelijk binnenkwamen
  // (er is geen unieke index meer, want om de week mogen twee bands één dagdeel delen).
  const raced = await findSubscriptionConflict(
    { dagdeel_id: dagdeelId, frequency, start_date: startDate },
    subscription.id
  );
  const storageRaced =
    !!storageUnit && (await getOccupiedStorageUnits(subscription.id)).includes(storageUnit);
  if (storageRaced) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json(
      { error: "De laatste opslagruimte is net verhuurd. Probeer het opnieuw zonder opslag." },
      { status: 409 }
    );
  }
  if (raced?.kind === "subscription") {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return NextResponse.json({ error: conflictMessage(raced) }, { status: 409 });
  }

  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  await sendSafely("bevestiging vaste reservering", () =>
    sendSubscriptionConfirmationEmail(subscription, bandEmails)
  );
  await sendSafely("melding vaste reservering bestuur", () =>
    sendSubscriptionNotificationToOrg(subscription)
  );
  return NextResponse.json({ subscriptionId: subscription.id });
}
