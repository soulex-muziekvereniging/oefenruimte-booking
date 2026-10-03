import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { todayStr } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { formatRhythm } from "@/lib/schedule";

// Overzicht van alle betalingen voor het beheer (tab Betalingen): periodes van vaste
// reserveringen en online betaalde losse boekingen, het afgelopen jaar en alles wat nog
// komt. Alleen lezen.
export type PaymentRow = {
  id: string;
  kind: "periode" | "los";
  band: string;
  description: string;
  amountCents: number;
  status: "betaald" | "open" | "te laat" | "kwijtgescholden" | "geannuleerd";
  date: string; // vervaldatum (periode) of repetitiedatum (los)
  graceUntil: string | null;
  paidAt: string | null;
  paidBy: string | null;
};

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const today = todayStr();
  const since = addDaysStr(today, -365);
  const rows: PaymentRow[] = [];

  const { data: periods, error: periodsError } = await supabase
    .from("subscription_payments")
    .select(
      "id, period_start, period_end, amount_cents, due_date, grace_until, status, paid_at, paid_by, subscriptions(band_name, weekday, dagdeel_id, frequency)"
    )
    .gte("period_start", since)
    .order("period_start", { ascending: false });
  if (periodsError) {
    return NextResponse.json({ error: "Kon de betalingen niet laden" }, { status: 500 });
  }

  for (const p of periods ?? []) {
    const sub = (Array.isArray(p.subscriptions) ? p.subscriptions[0] : p.subscriptions) as {
      band_name: string;
      weekday: number;
      dagdeel_id: string;
      frequency: "weekly" | "biweekly";
    } | null;
    const status: PaymentRow["status"] =
      p.status === "paid"
        ? "betaald"
        : p.status === "waived"
          ? "kwijtgescholden"
          : p.grace_until < today
            ? "te laat"
            : "open";
    rows.push({
      id: p.id,
      kind: "periode",
      band: sub?.band_name ?? "?",
      description: `${sub ? formatRhythm(sub) : "Vaste reservering"}, ${shortDate(p.period_start)} t/m ${shortDate(p.period_end)}`,
      amountCents: p.amount_cents,
      status,
      date: p.due_date,
      graceUntil: p.status === "unpaid" ? p.grace_until : null,
      paidAt: p.paid_at,
      paidBy: p.paid_by,
    });
  }

  // Losse boekingen die online betaald zijn (door beheer toegevoegde boekingen zonder
  // betaling tellen niet mee).
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, band_name, slot_date, slot_start_time, price_cents, status, paid_by, created_at")
    .not("mollie_payment_id", "is", null)
    .in("status", ["confirmed", "cancelled"])
    .gte("slot_date", since)
    .order("slot_date", { ascending: false });
  if (bookingsError) {
    return NextResponse.json({ error: "Kon de betalingen niet laden" }, { status: 500 });
  }

  for (const b of bookings ?? []) {
    rows.push({
      id: b.id,
      kind: "los",
      band: b.band_name,
      description: `Losse boeking ${shortDate(b.slot_date)}, ${b.slot_start_time.slice(0, 5)}`,
      amountCents: b.price_cents,
      status: b.status === "cancelled" ? "geannuleerd" : "betaald",
      date: b.slot_date,
      graceUntil: null,
      paidAt: b.created_at,
      paidBy: b.paid_by,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  return NextResponse.json(rows);
}

function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}
