import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json();
  const { active } = body;

  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Ongeldige waarde voor 'active'" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("members")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Kon lid niet bijwerken" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { error } = await supabase.from("members").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Kon lid niet verwijderen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
