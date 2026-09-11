import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { config } from "@/config";
import { verifyMagicLinkToken } from "@/lib/magicLink";
import { hoursUntilSlot } from "@/lib/date";
import { firstOfMonthStr } from "@/lib/periods";
import { getSlotsForRange } from "@/lib/slots";
import { getActiveMemberEmails } from "@/lib/members";
import { sendSwapConfirmationEmail, sendSwapNotificationToOrg } from "@/lib/email";

// Zelf één repetitie binnen de lopende periode verplaatsen naar een ander vrij
// dagdeel - max. config.subscriptionMaxSwapsPerPeriod keer per kalendermaand, en
// alleen tot config.cancellationCutoffHours uur van tevoren (besluit bestuur 2026-09-11).
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
    .ilike("contact_email", email)
    .eq("status", "active")
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "Vaste reservering niet gevonden of niet actief" },
      { status: 404 }
    );
  }

  const originalWeekday = new Date(originalDate + "T00:00:00").getDay();
  if (originalWeekday !== subscription.weekday) {
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

  const periodMonth = firstOfMonthStr(new Date(originalDate + "T00:00:00"));
  const newPeriodMonth = firstOfMonthStr(new Date(newDate + "T00:00:00"));
  if (newPeriodMonth !== periodMonth) {
    return NextResponse.json(
      { error: "Je kunt alleen binnen dezelfde periode (kalendermaand) schuiven" },
      { status: 400 }
    );
  }

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
    .eq("period_month", periodMonth);

  if ((count ?? 0) >= config.subscriptionMaxSwapsPerPeriod) {
    return NextResponse.json(
      {
        error: `Je hebt deze periode al ${config.subscriptionMaxSwapsPerPeriod} keer geschoven. Neem contact op met ${config.organizationName} als dit een keer extra moet.`,
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
    period_month: periodMonth,
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

  const bandEmails = await getActiveMemberEmails(subscription.band_name);
  await sendSwapConfirmationEmail(subscription, originalDate, newDate, newDagdeelId, bandEmails);
  await sendSwapNotificationToOrg(subscription, originalDate, newDate, newDagdeelId);

  return NextResponse.json({ success: true });
}
