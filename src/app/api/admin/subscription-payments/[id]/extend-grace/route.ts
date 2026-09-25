import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { addDaysStr } from "@/lib/periods";

const EXTEND_DAYS = 14;

// Handmatige coulance-verlenging voor een goed verhaal ("onze drummer ligt in het
// ziekenhuis") - geen formulier of procedure, gewoon één knop in het admin-scherm.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data: current } = await supabase
    .from("subscription_payments")
    .select("grace_until")
    .eq("id", id)
    .eq("status", "unpaid")
    .single();

  if (!current) {
    return NextResponse.json(
      { error: "Kon de coulanceperiode niet verlengen" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("subscription_payments")
    .update({
      grace_until: addDaysStr(current.grace_until, EXTEND_DAYS),
      warning_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Kon de coulanceperiode niet verlengen" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, graceUntil: data.grace_until });
}
