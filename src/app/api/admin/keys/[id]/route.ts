import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { parseKeyInput } from "@/lib/keys";

// Sleutel wijzigen (bij wie, status, alarmtag, opmerking).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const parsed = parseKeyInput(await request.json().catch(() => ({})), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from("keys")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.code === "23505" ? "Dat sleutelnummer bestaat al" : "Opslaan is niet gelukt" },
      { status: error?.code === "23505" ? 409 : 500 }
    );
  }
  return NextResponse.json(data);
}

// Sleutel uit het overzicht halen (bv. per ongeluk dubbel ingevoerd). Een verloren
// sleutel hoort op "geblokkeerd" te staan, niet verwijderd te worden.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { error } = await supabase.from("keys").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Verwijderen is niet gelukt" }, { status: 500 });
  return NextResponse.json({ success: true });
}
