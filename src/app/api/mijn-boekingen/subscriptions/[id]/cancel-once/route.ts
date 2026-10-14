import { NextRequest, NextResponse } from "next/server";
import { noteBorghChanges } from "@/lib/borghSync";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { hoursUntilSlot } from "@/lib/date";
import { occursOn, periodStartContaining } from "@/lib/schedule";
import { getActiveMemberEmails } from "@/lib/members";
import { getCancelDays } from "@/lib/paymentTerms";
import {
  sendRepetitionCancelledEmail,
  sendRepetitionCancelledNotificationToOrg,
  sendSafely,
} from "@/lib/email";

// Eén repetitie van een vaste plek annuleren (achteraf betalen, besluit bestuur okt 2026):
// tot de afmeldtermijn van tevoren (instelbaar, settings payment_terms), zonder maximum.
// Een geannuleerde keer hoeft niet betaald te worden en het dagdeel komt vrij voor anderen.
// Opgeslagen als rij in subscription_swaps zonder nieuwe datum (net als "vrijgeven" door
// het beheer, maar met by_admin = false). Een al verzette keer kan hier niet geannuleerd
// worden; dan mailt de band het bestuur.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { token, date } = body;

  const email = token ? verifyMagicLinkToken(token) : null;
  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Ongeldige datum" }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  const bandEmails = subscription
    ? await getActiveMemberEmails(subscription.band_name, subscription.contact_email)
    : [];
  const isBandMember =
    !!subscription &&
    (subscription.contact_email.toLowerCase() === email.toLowerCase() ||
      bandEmails.some((e) => e.toLowerCase() === email.toLowerCase()));

  if (!subscription || !isBandMember) {
    return NextResponse.json(
      { error: "Vaste reservering niet gevonden of niet actief" },
      { status: 404 }
    );
  }

  if (!occursOn(subscription, date)) {
    return NextResponse.json(
      { error: "Deze datum hoort niet bij jullie vaste tijdslot" },
      { status: 400 }
    );
  }

  const cancelDays = await getCancelDays();
  const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id)!;
  if (hoursUntilSlot(date, `${String(dagdeel.startHour).padStart(2, "0")}:00:00`) < cancelDays * 24) {
    return NextResponse.json(
      {
        error: `Annuleren kan tot ${cancelDays} dagen van tevoren. Deze keer wordt dus gewoon gerekend; verzetten kan misschien nog wel.`,
      },
      { status: 400 }
    );
  }

  const { data: periods } = await supabase
    .from("subscription_payments")
    .select("period_start, period_end")
    .eq("subscription_id", id);

  const { error } = await supabase.from("subscription_swaps").insert({
    subscription_id: id,
    period_start: periodStartContaining(subscription.start_date, periods ?? [], date),
    original_date: date,
    new_date: null,
    new_dagdeel_id: null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Deze repetitie is al verzet of geannuleerd" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Annuleren is niet gelukt" }, { status: 500 });
  }

  await sendSafely("bevestiging annulering repetitie", () =>
    sendRepetitionCancelledEmail(subscription, date, bandEmails)
  );
  await sendSafely("melding annulering repetitie bestuur", () =>
    sendRepetitionCancelledNotificationToOrg(subscription, date)
  );

  await noteBorghChanges();
  return NextResponse.json({ success: true });
}
