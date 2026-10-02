import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import {
  borghWeekUrl,
  getBorghAuto,
  getBorghEmail,
  getLastBorghMail,
  markProcessed,
  parseBorghAuto,
  workList,
} from "@/lib/borghSync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function snapshot() {
  return {
    items: await workList(),
    borghEmail: await getBorghEmail(),
    borghAuto: await getBorghAuto(),
    lastAutoMail: await getLastBorghMail(),
    weekUrl: borghWeekUrl(),
  };
}

async function saveSetting(key: string, value: unknown, by: string) {
  const { data: old } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  await supabase.from("settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  await supabase.from("settings_history").insert({
    key,
    old_value: old?.value ?? null,
    new_value: value,
    changed_by: by,
  });
}

async function adminEmail(request: NextRequest): Promise<string> {
  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  return admin?.email ?? "onbekend";
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  try {
    return NextResponse.json(await snapshot());
  } catch {
    return NextResponse.json(
      { error: "Kon de werklijst niet laden (is migratie 016 al uitgevoerd?)" },
      { status: 500 }
    );
  }
}

// { keys: string[] } of { all: true } -> als verwerkt in de zalenplanner markeren
// { borghEmail: string } -> mailadres van De Borgh opslaan (leeg = wissen)
// { borghAuto: { enabled, delayHours } } -> automatisch mailen aan/uit + wachttijd
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  try {
    const by = await adminEmail(request);

    if (typeof body.borghEmail === "string") {
      const email = body.borghEmail.trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Dat is geen geldig e-mailadres" }, { status: 400 });
      }
      await saveSetting("borgh_email", email, by);
      return NextResponse.json(await snapshot());
    }

    if (body.borghAuto && typeof body.borghAuto === "object") {
      await saveSetting("borgh_auto", parseBorghAuto(body.borghAuto), by);
      return NextResponse.json(await snapshot());
    }

    const keys: string[] =
      body.all === true
        ? (await workList()).map((w) => w.key)
        : Array.isArray(body.keys)
          ? body.keys.filter((k: unknown): k is string => typeof k === "string")
          : [];

    await markProcessed(keys, by);
    return NextResponse.json(await snapshot());
  } catch {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
}
