import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { cleanPhone, isValidPhone } from "@/lib/memberPhones";

// Ledenlijst importeren (beheer > Leden). Eerst met dryRun: true een voorbeeld, daarna
// echt. Regels: nieuw e-mailadres = nieuw lid (bandnaam en geldig telefoonnummer
// verplicht); bestaand e-mailadres = alleen telefoon/actief bijwerken als die anders zijn.
// Er wordt nooit iemand verwijderd en een bestaand lid wordt niet naar een andere band
// verplaatst. Body: { rows: { line, name, email, phone, active }[], dryRun: boolean }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 500;

type InRow = { line: number; name: string; email: string; phone: string; active: boolean | null };
type Outcome =
  | { line: number; email: string; name: string; action: "toevoegen"; phone: string }
  | { line: number; email: string; name: string; action: "bijwerken"; changes: string[]; id: string; update: Record<string, unknown> }
  | { line: number; email: string; name: string; action: "ongewijzigd" | "overslaan" | "fout"; reason?: string };

export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const rows: InRow[] = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS + 1) : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Geen regels gevonden in het bestand" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Maximaal ${MAX_ROWS} regels per keer` }, { status: 400 });
  }
  const dryRun = body.dryRun !== false;

  const { data: existing, error } = await supabase.from("members").select("id, name, email, phone, active");
  if (error) return NextResponse.json({ error: "Kon de ledenlijst niet lezen" }, { status: 500 });
  const byEmail = new Map((existing ?? []).map((m) => [m.email.toLowerCase(), m]));

  const seen = new Set<string>();
  const outcomes: Outcome[] = rows.map((r) => {
    const line = Number(r.line) || 0;
    const name = String(r.name ?? "").trim().slice(0, 100);
    const email = String(r.email ?? "").trim().toLowerCase();
    const phone = cleanPhone(r.phone);
    const active = typeof r.active === "boolean" ? r.active : null;

    if (!EMAIL_RE.test(email)) return { line, email, name, action: "fout", reason: "geen geldig e-mailadres" };
    if (seen.has(email)) return { line, email, name, action: "overslaan", reason: "staat dubbel in het bestand" };
    seen.add(email);

    const current = byEmail.get(email);
    if (!current) {
      if (!name) return { line, email, name, action: "fout", reason: "bandnaam ontbreekt" };
      if (!isValidPhone(phone)) return { line, email, name, action: "fout", reason: "geen geldig telefoonnummer (minstens 10 cijfers)" };
      return { line, email, name, action: "toevoegen", phone };
    }

    const update: Record<string, unknown> = {};
    const changes: string[] = [];
    if (phone && phone !== (current.phone ?? "")) {
      if (!isValidPhone(phone)) return { line, email, name: current.name, action: "fout", reason: "geen geldig telefoonnummer" };
      update.phone = phone;
      changes.push(`telefoon ${current.phone ?? "-"} → ${phone}`);
    }
    if (active !== null && active !== current.active) {
      update.active = active;
      changes.push(active ? "weer actief" : "op inactief");
    }
    const otherBand =
      name && name.toLowerCase() !== current.name.toLowerCase()
        ? ` (staat al bij "${current.name}"; band wordt niet gewijzigd)`
        : "";
    if (changes.length === 0) {
      return { line, email, name: current.name, action: "ongewijzigd", reason: otherBand ? otherBand.trim() : undefined };
    }
    return { line, email, name: current.name, action: "bijwerken", changes: otherBand ? [...changes, otherBand.trim()] : changes, id: current.id, update };
  });

  if (!dryRun) {
    const toInsert = outcomes.filter((o) => o.action === "toevoegen") as Extract<Outcome, { action: "toevoegen" }>[];
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("members")
        .insert(toInsert.map((o) => ({ name: o.name, email: o.email, phone: o.phone, active: true })));
      if (insErr) return NextResponse.json({ error: "Toevoegen is niet gelukt" }, { status: 500 });
    }
    for (const o of outcomes) {
      if (o.action !== "bijwerken") continue;
      await supabase
        .from("members")
        .update({ ...o.update, updated_at: new Date().toISOString() })
        .eq("id", o.id);
    }
  }

  const count = (a: Outcome["action"]) => outcomes.filter((o) => o.action === a).length;
  return NextResponse.json({
    dryRun,
    summary: {
      toevoegen: count("toevoegen"),
      bijwerken: count("bijwerken"),
      ongewijzigd: count("ongewijzigd"),
      overslaan: count("overslaan"),
      fout: count("fout"),
    },
    rows: outcomes.map((o) => ({
      line: o.line,
      email: o.email,
      name: o.name,
      action: o.action,
      detail:
        o.action === "bijwerken" ? o.changes.join(", ") : "reason" in o ? (o.reason ?? "") : "",
    })),
  });
}
