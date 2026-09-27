import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { parseWhatsappTemplates } from "@/lib/whatsappTemplates";

async function currentTemplates() {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "whatsapp_templates")
    .maybeSingle();
  return parseWhatsappTemplates(data?.value);
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  return NextResponse.json(await currentTemplates());
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const templates = parseWhatsappTemplates(body);
  const old = await currentTemplates();

  const adminId = getAdminId(request);
  const { data: admin } = adminId
    ? await supabase.from("admin_users").select("email").eq("id", adminId).maybeSingle()
    : { data: null };
  const changedBy = admin?.email ?? "onbekend";

  const { error } = await supabase.from("settings").upsert({
    key: "whatsapp_templates",
    value: templates,
    updated_at: new Date().toISOString(),
    updated_by: changedBy,
  });
  if (error) {
    return NextResponse.json({ error: "Opslaan is niet gelukt" }, { status: 500 });
  }
  await supabase.from("settings_history").insert({
    key: "whatsapp_templates",
    old_value: old,
    new_value: templates,
    changed_by: changedBy,
  });

  return NextResponse.json(templates);
}
