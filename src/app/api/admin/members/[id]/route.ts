import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { bandHasOtherPhone, cleanPhone } from "@/lib/memberPhones";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const update: { active?: boolean; phone?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.active === "boolean") update.active = body.active;

  if ("phone" in body) {
    update.phone = cleanPhone(body.phone);
    if (!update.phone) {
      const { data: member } = await supabase.from("members").select("name").eq("id", id).maybeSingle();
      if (member && !(await bandHasOtherPhone(member.name, id))) {
        return NextResponse.json(
          { error: "Dit is het enige telefoonnummer van de band - vul eerst bij een ander bandlid een nummer in" },
          { status: 400 }
        );
      }
    }
  }

  if (update.active === undefined && !("phone" in update)) {
    return NextResponse.json({ error: "Niets om bij te werken" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("members")
    .update(update)
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

  // Het laatste lid met een telefoonnummer alleen verwijderen als de band daarmee helemaal
  // verdwijnt - anders blijft er een band zonder nummer over.
  const { data: member } = await supabase.from("members").select("name, phone").eq("id", id).maybeSingle();
  if (member?.phone) {
    const { data: bandMembers } = await supabase
      .from("members")
      .select("id, phone")
      .ilike("name", member.name.trim());
    const others = (bandMembers ?? []).filter((m) => m.id !== id);
    if (others.length > 0 && !others.some((m) => !!m.phone?.trim())) {
      return NextResponse.json(
        { error: "Dit is het enige telefoonnummer van de band - vul eerst bij een ander bandlid een nummer in" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase.from("members").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Kon lid niet verwijderen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
