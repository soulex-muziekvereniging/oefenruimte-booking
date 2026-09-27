import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { markProcessed, workList } from "@/lib/borghSync";

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  try {
    return NextResponse.json(await workList());
  } catch {
    return NextResponse.json(
      { error: "Kon de werklijst niet laden (is migratie 016 al uitgevoerd?)" },
      { status: 500 }
    );
  }
}

// { keys: string[] } of { all: true } -> als verwerkt in de zalenplanner markeren
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  try {
    const keys: string[] =
      body.all === true
        ? (await workList()).map((w) => w.key)
        : Array.isArray(body.keys)
          ? body.keys.filter((k: unknown): k is string => typeof k === "string")
          : [];

    const adminId = getAdminId(request);
    const { data: admin } = adminId
      ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
      : { data: null };

    await markProcessed(keys, admin?.email ?? "onbekend");
    return NextResponse.json(await workList());
  } catch {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
}
