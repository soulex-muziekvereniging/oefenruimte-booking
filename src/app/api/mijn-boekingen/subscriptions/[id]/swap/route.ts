import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { hoursUntilSlot } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { occursOn, periodStartContaining } from "@/lib/schedule";
import { getSlotsForRange } from "@/lib/slots";
import { getActiveMemberEmails } from "@/lib/members";
import { sendSwapConfirmationEmail, sendSwapNotificationToOrg, sendSafely } from "@/lib/email";

// Zelf één repetitie van een vaste reservering verplaatsen naar een ander vrij dagdeel:
// vanaf nu tot config.subscriptionSwapMaxDaysLater dagen na de oorspronkelijke datum,
// max. config.subscriptionMaxSwapsPerPeriod keer per betaalperiode, en alleen tot
// config.cancellationCutoffHours uur van tevoren. Elk bandlid mag dit doen.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { token, originalDate, newDate, newDagdeelId } = body;

  const email = token ? verifyMagicLinkToken(token) : null;
  if (!email) {
    return NextResponse.json(
      { error: "Deze link is verlopen of ongeldig. Vraag een nieuwe link aan." },
      { status: 401 }
    );
  }

  if (!originalDate || !newDate || !newDagdeelId) {
    return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
  }

  if (!config.dagdelen.some((d) => d.id === newDagdeelId)) {
    return NextResponse.json({ error: "Ongeldig dagdeel" }, { status: 400 });
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

  if (!occursOn(subscription, originalDate)) {
    return NextResponse.json(
      { error: "Deze datum hoort niet bij jullie vaste tijdslot" },
      { status: 400 }
    );
  }

  const originalDagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id)!;
  if (hoursUntilSlot(originalDate, `${originalDagdeel.startHour.toString().padStart(2, "0")}:00:00`) < config.cancellationCutoffHours) {
    return NextResponse.json(
      {
        error: `Verplaatsen kan niet meer, dit moet uiterlijk ${config.cancellationCutoffHours} uur van tevoren. Neem contact op met ${config.organizationName}.`,
      },
      { status: 400 }
    );
  }

  if (newDate > addDaysStr(originalDate, config.subscriptionSwapMaxDaysLater)) {
    return NextResponse.json(
      {
        error: `Je kunt tot ${config.subscriptionSwapMaxDaysLater} dagen later verplaatsen. Moet het anders? Mail dan naar ${config.organizationEmail}.`,
      },
      { status: 400 }
    );
  }

  const { data: periods } = await supabase
    .from("subscription_payments")
    .select("period_start, period_end")
    .eq("subscription_id", id);
  const periodStart = periodStartContaining(subscription.start_date, periods ?? [], originalDate);

  const newDagdeel = config.dagdelen.find((d) => d.id === newDagdeelId)!;
  if (hoursUntilSlot(newDate, `${newDagdeel.startHour.toString().padStart(2, "0")}:00:00`) < config.cancellationCutoffHours) {
    return NextResponse.json(
      {
        error: `Het nieuwe moment moet ook uiterlijk ${config.cancellationCutoffHours} uur van tevoren vastgelegd worden.`,
      },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from("subscription_swaps")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", id)
    .eq("period_start", periodStart);

  if ((count ?? 0) >= config.subscriptionMaxSwapsPerPeriod) {
    return NextResponse.json(
      {
        error: `Je hebt in deze periode van ${config.periodWeeks} weken al ${config.subscriptionMaxSwapsPerPeriod} keer verplaatst. Moet het nog een keer? Mail dan naar ${config.organizationEmail}.`,
      },
      { status: 400 }
    );
  }

  // Hergebruik exact dezelfde bezet/vrij-logica als de publieke kalender, zodat er
  // nooit een verschil kan ontstaan tussen wat een band hier ziet en wat feitelijk vrij is.
  const [targetDay] = await getSlotsForRange(newDate, newDate);
  const targetSlot = targetDay?.slots.find((s) => s.dagdeelId === newDagdeelId);
  if (!targetSlot?.available) {
    return NextResponse.json({ error: "Dat dagdeel is niet (meer) vrij" }, { status: 409 });
  }

  const { error } = await supabase.from("subscription_swaps").insert({
    subscription_id: id,
    period_start: periodStart,
    original_date: originalDate,
    new_date: newDate,
    new_dagdeel_id: newDagdeelId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Deze repetitie is al verplaatst" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Kon niet verplaatsen" }, { status: 500 });
  }

  await sendSafely("bevestiging ruiling", () =>
    sendSwapConfirmationEmail(subscription, originalDate, newDate, newDagdeelId, bandEmails)
  );
  await sendSafely("melding ruiling bestuur", () =>
    sendSwapNotificationToOrg(subscription, originalDate, newDate, newDagdeelId)
  );

  return NextResponse.json({ success: true });
}
