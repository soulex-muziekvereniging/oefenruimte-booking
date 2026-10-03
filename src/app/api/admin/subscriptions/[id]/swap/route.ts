import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { noteBorghChanges } from "@/lib/borghSync";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { hoursUntilSlot, todayStr } from "@/lib/date";
import { occursOn, periodStartContaining } from "@/lib/schedule";
import { getSlotsForRange } from "@/lib/slots";
import { getActiveMemberEmails } from "@/lib/members";
import {
  sendRepetitionReleasedEmail,
  sendSafely,
  sendSwapConfirmationEmail,
} from "@/lib/email";

// Beheer verplaatst één repetitie van een vaste reservering namens de band, of geeft die
// ene keer vrij (newDate leeg). Zonder de limieten voor bands (aantal per periode, 14 dagen,
// 48 uur van tevoren): het bestuur beslist zelf. De band krijgt een mail; De Borgh hoort
// het via de werklijst/automatische mail.
// Body: { originalDate, newDate?, newDagdeelId? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const originalDate: unknown = body.originalDate;
  const newDate: string | null = typeof body.newDate === "string" && body.newDate ? body.newDate : null;
  const newDagdeelId: string | null = newDate ? body.newDagdeelId ?? null : null;
  if (typeof originalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(originalDate)) {
    return NextResponse.json({ error: "Ongeldige datum" }, { status: 400 });
  }
  if (newDate && (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !config.dagdelen.some((d) => d.id === newDagdeelId))) {
    return NextResponse.json({ error: "Kies een nieuw moment" }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const stillRunning =
    !!subscription &&
    (subscription.status === "active" ||
      (subscription.status === "cancelled" && !!subscription.active_until));
  if (!subscription || !stillRunning || !occursOn(subscription, originalDate)) {
    return NextResponse.json(
      { error: "Deze datum hoort niet (meer) bij een lopende vaste reservering" },
      { status: 400 }
    );
  }

  const original = config.dagdelen.find((d) => d.id === subscription.dagdeel_id)!;
  const startOf = (h: number) => `${String(h).padStart(2, "0")}:00:00`;
  if (originalDate < todayStr() || hoursUntilSlot(originalDate, startOf(original.startHour)) <= 0) {
    return NextResponse.json({ error: "Deze repetitie is al begonnen of voorbij" }, { status: 400 });
  }

  if (newDate) {
    const target = config.dagdelen.find((d) => d.id === newDagdeelId)!;
    if (hoursUntilSlot(newDate, startOf(target.startHour)) <= 0) {
      return NextResponse.json({ error: "Het nieuwe moment ligt in het verleden" }, { status: 400 });
    }
    const [day] = await getSlotsForRange(newDate, newDate);
    if (!day?.slots.find((s) => s.dagdeelId === newDagdeelId)?.available) {
      return NextResponse.json({ error: "Dat dagdeel is niet (meer) vrij" }, { status: 409 });
    }
  }

  const { data: periods } = await supabase
    .from("subscription_payments")
    .select("period_start, period_end")
    .eq("subscription_id", id);
  const row = {
    subscription_id: id,
    period_start: periodStartContaining(subscription.start_date, periods ?? [], originalDate),
    original_date: originalDate,
    new_date: newDate,
    new_dagdeel_id: newDagdeelId,
  };

  let { error } = await supabase.from("subscription_swaps").insert({ ...row, by_admin: true });
  if (error && (error.code === "42703" || error.code === "PGRST204" || error.message.includes("by_admin"))) {
    ({ error } = await supabase.from("subscription_swaps").insert(row)); // migratie 018 nog niet gedraaid
  }
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Deze repetitie is al verplaatst of vrijgegeven" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }

  const bandEmails = await getActiveMemberEmails(subscription.band_name, subscription.contact_email);
  if (newDate) {
    await sendSafely("bevestiging verplaatsing (beheer)", () =>
      sendSwapConfirmationEmail(subscription, originalDate, newDate, newDagdeelId!, bandEmails)
    );
  } else {
    await sendSafely("bevestiging vrijgave (beheer)", () =>
      sendRepetitionReleasedEmail(subscription, originalDate, bandEmails)
    );
  }

  await noteBorghChanges();
  return NextResponse.json({ success: true });
}
