import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase
    .from("membership_requests")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Kon aanvraag niet bijwerken" }, { status: 500 });
  }

  return NextResponse.json(data);
}
