import { NextRequest, NextResponse } from "next/server";
import { getAdminId, verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  const { id } = await params;

  if (id === getAdminId(request)) {
    return NextResponse.json(
      { error: "Je kunt je eigen account niet verwijderen" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("admin_users").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Verwijderen is niet gelukt" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
