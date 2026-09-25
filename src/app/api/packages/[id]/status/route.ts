import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alleen de status, voor de pagina waar Mollie de bezoeker na het betalen naartoe
// stuurt - Mollie doet dat ook bij een afgebroken of mislukte betaling.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Onbekend pakket" }, { status: 404 });
  }

  const { data } = await supabase.from("booking_packages").select("status").eq("id", id).maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Onbekend pakket" }, { status: 404 });
  }

  return NextResponse.json({ status: data.status });
}
