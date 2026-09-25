import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;
  const { id } = await params;

  // De laatste ontvanger laten staan: anders gaan meldingen stil terug naar het vaste
  // adres en denkt niemand eraan dat dat zo is.
  const { count } = await supabase
    .from("notification_recipients")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "Er moet minstens één adres overblijven dat meldingen krijgt" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Verwijderen is niet gelukt" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
