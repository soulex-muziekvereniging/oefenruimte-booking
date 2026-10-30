import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import {
  cleanPhone,
  EMAIL_INVALID_ERROR,
  isValidEmail,
  isValidPhone,
  PHONE_REQUIRED_ERROR,
} from "@/lib/memberPhones";
import { todayStr } from "@/lib/date";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authError = await verifyAdminPassword(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const update: { active?: boolean; phone?: string | null; email?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.active === "boolean") update.active = body.active;

  if ("phone" in body) {
    update.phone = cleanPhone(body.phone);
    if (!isValidPhone(update.phone)) {
      return NextResponse.json({ error: PHONE_REQUIRED_ERROR }, { status: 400 });
    }
  }

  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    update.email = email;
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: EMAIL_INVALID_ERROR }, { status: 400 });
    }
  }

  if (update.active === undefined && !("phone" in update) && !("email" in update)) {
    return NextResponse.json({ error: "Niets om bij te werken" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("members")
    .select("email, phone")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("members")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Dit e-mailadres staat al op de ledenlijst" }, { status: 409 });
    }
    return NextResponse.json({ error: "Kon lid niet bijwerken" }, { status: 500 });
  }

  // Is dit lid ook de contactpersoon van een vaste plek of een komende boeking? Dan daar het
  // nieuwe adres/nummer ook invullen: de rekeningen en bevestigingen gaan altijd ook naar de
  // contactpersoon, en het oude adres mag daar niet blijven hangen.
  if (before) {
    const contact: { contact_email?: string; contact_phone?: string | null } = {};
    if (update.email && update.email !== before.email) contact.contact_email = update.email;
    if ("phone" in update && update.phone !== before.phone) contact.contact_phone = update.phone;
    if (Object.keys(contact).length > 0) {
      await supabase
        .from("subscriptions")
        .update({ ...contact, updated_at: new Date().toISOString() })
        .ilike("contact_email", before.email)
        .in("status", ["active", "pending_first_payment"]);
      await supabase
        .from("bookings")
        .update(contact)
        .ilike("contact_email", before.email)
        .eq("status", "confirmed")
        .gte("slot_date", todayStr());
    }
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
