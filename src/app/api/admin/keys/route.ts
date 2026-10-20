import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { parseKeyInput } from "@/lib/keys";

// Sleuteloverzicht: alle sleutels, op nummer.
export async function GET(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const { data, error } = await supabase.from("keys").select("*");
  if (error) {
    return NextResponse.json(
      { error: "Kon de sleutels niet ophalen (is migratie 020 al uitgevoerd?)" },
      { status: 500 }
    );
  }
  // Numeriek sorteren waar het kan ("9" voor "10"), anders op tekst.
  const sorted = data.sort((a, b) =>
    a.key_number.localeCompare(b.key_number, "nl", { numeric: true })
  );
  return NextResponse.json(sorted);
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const parsed = parseKeyInput(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase.from("keys").insert(parsed.value).select().single();
  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? `Sleutel ${parsed.value.key_number} staat al in het overzicht`
            : "Opslaan is niet gelukt",
      },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }
  return NextResponse.json(data);
}
