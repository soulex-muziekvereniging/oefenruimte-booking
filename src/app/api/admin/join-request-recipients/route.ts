import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { getJoinRequestList } from "@/lib/notifications";

// Wie de mail krijgt bij een aanvraag via "Lid worden". Opgeslagen als lijst in de tabel
// settings (key "join_request_recipients"); leeg = de algemene meldingenlijst krijgt ze.
const KEY = "join_request_recipients";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json({ emails: await getJoinRequestList() });
}

// { email, action: "add" | "remove" }
export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const clean = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const action = body.action === "remove" ? "remove" : "add";
  const old = await getJoinRequestList();
  let next: string[];

  if (action === "add") {
    if (!EMAIL_RE.test(clean)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres in" }, { status: 400 });
    }
    if (old.includes(clean)) {
      return NextResponse.json({ error: "Dit adres staat al in de lijst" }, { status: 409 });
    }
    next = [...old, clean].sort();
  } else {
    next = old.filter((e) => e !== clean);
  }

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const by = admin?.email ?? "onbekend";

  const { error } = await supabase.from("settings").upsert({
    key: KEY,
    value: next,
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  if (error) return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  await supabase.from("settings_history").insert({
    key: KEY,
    old_value: old,
    new_value: next,
    changed_by: by,
  });
  return NextResponse.json({ emails: next });
}
