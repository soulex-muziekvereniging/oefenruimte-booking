import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { todayStr } from "@/lib/date";
import { addDaysStr } from "@/lib/periods";
import { formatRhythm } from "@/lib/schedule";
import {
  currentFiscalYear,
  FIRST_FISCAL_YEAR,
  fiscalYearLabel,
  fiscalYearRange,
  getFiscalStartMonth,
  parseStartMonth,
} from "@/lib/fiscalYear";

// Betalingen per boekjaar voor het beheer (tab Betalingen + export): periodes van vaste
// reserveringen en online betaalde losse boekingen. Een betaling hoort bij het boekjaar
// waarin hij is ontvangen; wat (nog) niet betaald is bij het jaar van de vervaldatum.
// Er wordt nooit iets verwijderd: oudere boekjaren blijven op te vragen.
export type PaymentRow = {
  id: string;
  kind: "periode" | "los";
  band: string;
  description: string;
  amountCents: number;
  status: "betaald" | "open" | "te laat" | "kwijtgescholden" | "geannuleerd";
  date: string; // datum waarop hij in het boekjaar telt (ontvangen, anders vervaldatum)
  dueDate: string | null;
  graceUntil: string | null;
  paidAt: string | null;
  paidBy: string | null;
};

function amsterdamDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const startMonth = await getFiscalStartMonth();
  const current = currentFiscalYear(startMonth);
  const asked = Number(request.nextUrl.searchParams.get("jaar"));
  const year =
    Number.isInteger(asked) && asked >= FIRST_FISCAL_YEAR - 1 && asked <= current + 1 ? asked : current;
  const { from, to } = fiscalYearRange(year, startMonth);
  const inYear = (d: string) => d >= from && d < to;
  const today = todayStr();
  const rows: PaymentRow[] = [];

  // Ruim ophalen (een periode kan vóór het boekjaar beginnen en erin betaald worden) en
  // daarna precies filteren op de datum waarop hij telt.
  const { data: periods, error: periodsError } = await supabase
    .from("subscription_payments")
    .select(
      "id, period_start, period_end, amount_cents, due_date, grace_until, status, paid_at, paid_by, subscriptions(band_name, weekday, dagdeel_id, frequency)"
    )
    .gte("period_start", addDaysStr(from, -120))
    .lt("period_start", addDaysStr(to, 120));
  if (periodsError) {
    return NextResponse.json({ error: "Kon de betalingen niet laden" }, { status: 500 });
  }

  for (const p of periods ?? []) {
    const date = p.status === "paid" && p.paid_at ? amsterdamDate(p.paid_at) : p.due_date;
    if (!inYear(date)) continue;
    const sub = (Array.isArray(p.subscriptions) ? p.subscriptions[0] : p.subscriptions) as {
      band_name: string;
      weekday: number;
      dagdeel_id: string;
      frequency: "weekly" | "biweekly";
    } | null;
    rows.push({
      id: p.id,
      kind: "periode",
      band: sub?.band_name ?? "?",
      description: `${sub ? formatRhythm(sub) : "Vaste reservering"}, ${shortDate(p.period_start)} t/m ${shortDate(p.period_end)}`,
      amountCents: p.amount_cents,
      status:
        p.status === "paid"
          ? "betaald"
          : p.status === "waived"
            ? "kwijtgescholden"
            : p.grace_until < today
              ? "te laat"
              : "open",
      date,
      dueDate: p.due_date,
      graceUntil: p.status === "unpaid" ? p.grace_until : null,
      paidAt: p.paid_at,
      paidBy: p.paid_by,
    });
  }

  // Losse boekingen worden bij het boeken betaald (beheer-boekingen zonder betaling tellen
  // niet mee).
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, band_name, slot_date, slot_start_time, price_cents, status, paid_by, created_at")
    .not("mollie_payment_id", "is", null)
    .in("status", ["confirmed", "cancelled"])
    .gte("created_at", `${addDaysStr(from, -1)}T00:00:00Z`)
    .lt("created_at", `${addDaysStr(to, 1)}T00:00:00Z`);
  if (bookingsError) {
    return NextResponse.json({ error: "Kon de betalingen niet laden" }, { status: 500 });
  }

  for (const b of bookings ?? []) {
    const date = amsterdamDate(b.created_at);
    if (!inYear(date)) continue;
    rows.push({
      id: b.id,
      kind: "los",
      band: b.band_name,
      description: `Losse boeking ${shortDate(b.slot_date)}, ${b.slot_start_time.slice(0, 5)}`,
      amountCents: b.price_cents,
      status: b.status === "cancelled" ? "geannuleerd" : "betaald",
      date,
      dueDate: null,
      graceUntil: null,
      paidAt: b.created_at,
      paidBy: b.paid_by,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));

  const years: { year: number; label: string }[] = [];
  for (let y = current; y >= Math.min(FIRST_FISCAL_YEAR, current); y--) {
    years.push({ year: y, label: fiscalYearLabel(y, startMonth) });
  }

  return NextResponse.json({
    rows,
    year,
    label: fiscalYearLabel(year, startMonth),
    from,
    to: addDaysStr(to, -1),
    years,
    startMonth,
  });
}

// { startMonth: 1-12 } -> in welke maand het boekjaar begint
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const startMonth = parseStartMonth(body.startMonth);
  if (startMonth === null) {
    return NextResponse.json({ error: "Kies een maand" }, { status: 400 });
  }

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const by = admin?.email ?? "onbekend";
  const old = await getFiscalStartMonth();

  const { error } = await supabase.from("settings").upsert({
    key: "fiscal_year",
    value: { startMonth },
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  if (error) return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  await supabase.from("settings_history").insert({
    key: "fiscal_year",
    old_value: { startMonth: old },
    new_value: { startMonth },
    changed_by: by,
  });
  return NextResponse.json({ startMonth });
}
