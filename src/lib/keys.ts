// Sleuteloverzicht (beheer > Sleutels, tabel keys, migratie 020). Sleutels zijn fysiek
// geregeld; dit is alleen de administratie: welke sleutel en alarmtag heeft wie.

export const KEY_STATUSES = ["uitgegeven", "beschikbaar", "geblokkeerd"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export type AccessKey = {
  id: string;
  key_number: string;
  alarm_tag: string | null;
  holder: string | null; // bandnaam uit de ledenlijst of vrije tekst; leeg = niet uitgegeven
  status: KeyStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const text = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t ? t : null;
};

// Invoer uit het beheerformulier controleren. partial: bij wijzigen alleen wat meekomt.
export function parseKeyInput(
  body: Record<string, unknown>,
  partial = false
): { ok: true; value: Partial<Omit<AccessKey, "id" | "created_at" | "updated_at">> } | { ok: false; error: string } {
  const value: Partial<Omit<AccessKey, "id" | "created_at" | "updated_at">> = {};

  if (!partial || "key_number" in body) {
    const keyNumber = text(body.key_number, 40);
    if (!keyNumber) return { ok: false, error: "Vul een sleutelnummer in" };
    value.key_number = keyNumber;
  }
  if (!partial || "alarm_tag" in body) value.alarm_tag = text(body.alarm_tag, 40);
  if (!partial || "holder" in body) value.holder = text(body.holder);
  if (!partial || "note" in body) value.note = text(body.note, 500);
  if (!partial || "status" in body) {
    const status = body.status ?? "uitgegeven";
    if (!KEY_STATUSES.includes(status as KeyStatus)) return { ok: false, error: "Ongeldige status" };
    value.status = status as KeyStatus;
  }
  if (value.status === "uitgegeven" && "holder" in value && !value.holder) {
    return { ok: false, error: "Bij wie is de sleutel uitgegeven?" };
  }
  return { ok: true, value };
}
