import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { borghWeekUrl, getBorghEmail, markProcessed, workList } from "@/lib/borghSync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function snapshot() {
  return {
    items: await workList(),
    borghEmail: await getBorghEmail(),
    weekUrl: borghWeekUrl(),
  };
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
      const old = await getBorghEmail();
      await supabase.from("settings").upsert({
        key: "borgh_email",
        value: email,
        updated_at: new Date().toISOString(),
        updated_by: by,
      });
      await supabase.from("settings_history").insert({
        key: "borgh_email",
        old_value: old,
        new_value: email,
        changed_by: by,
      });
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
