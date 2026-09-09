import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const password = request.headers.get("x-admin-password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Ongeldig wachtwoord" }, { status: 401 });
  }

  const { data: membershipRequest, error: fetchError } = await supabase
    .from("membership_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !membershipRequest) {
    return NextResponse.json({ error: "Aanvraag niet gevonden" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("members").insert({
    name: membershipRequest.band_name,
    email: membershipRequest.contact_email.toLowerCase().trim(),
    active: true,
  });

  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "Kon lid niet toevoegen" }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("membership_requests")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Kon aanvraag niet bijwerken" }, { status: 500 });
  }

  return NextResponse.json(updated);
}
