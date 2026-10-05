// Ledenlijst als CSV (beheer > Leden): exporteren en importeren. Puntkomma als
// scheidingsteken (Nederlandse Excel); bij inlezen werken ook komma en tab. Kolommen:
// Bandnaam;E-mailadres;Telefoon;Actief. Zonder kopregel geldt die volgorde.
// Pure functies, zowel in de browser als op de server te gebruiken.

export type MemberCsvRow = {
  line: number; // regelnummer in het bestand, voor foutmeldingen
  name: string;
  email: string;
  phone: string;
  active: boolean | null; // null = kolom ontbreekt of leeg
};

export const MEMBER_CSV_HEADER = ["Bandnaam", "E-mailadres", "Telefoon", "Actief"];

function cell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function membersToCsv(
  members: { name: string; email: string; phone: string | null; active: boolean }[]
): string {
  const lines = [...members]
    .sort((a, b) => a.name.localeCompare(b.name, "nl") || a.email.localeCompare(b.email))
    .map((m) => [m.name, m.email, m.phone ?? "", m.active ? "ja" : "nee"].map(cell).join(";"));
  return "﻿" + [MEMBER_CSV_HEADER.join(";"), ...lines].join("\r\n");
}

// Eén regel splitsen, met aanhalingstekens ("a;b" en "" binnen een veld).
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseActive(value: string | undefined): boolean | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["ja", "j", "yes", "y", "1", "true", "waar", "actief"].includes(v)) return true;
  if (["nee", "n", "no", "0", "false", "onwaar", "inactief"].includes(v)) return false;
  return null;
}

export function parseMembersCsv(text: string): MemberCsvRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const firstFilled = lines.find((l) => l.trim()) ?? "";
  const sep = [";", "\t", ","].find((s) => firstFilled.includes(s)) ?? ";";

  // Kolommen herkennen aan de kopregel; anders de vaste volgorde.
  let cols = { name: 0, email: 1, phone: 2, active: 3 };
  let start = 0;
  const firstIndex = lines.findIndex((l) => l.trim());
  if (firstIndex >= 0) {
    const head = splitLine(lines[firstIndex], sep).map((h) => h.toLowerCase());
    const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
    const email = find("mail");
    if (email >= 0) {
      cols = {
        name: find("band", "naam", "name"),
        email,
        phone: find("telefoon", "tel", "phone", "mobiel"),
        active: find("actief", "active"),
      };
      start = firstIndex + 1;
    }
  }

  const rows: MemberCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = splitLine(lines[i], sep);
    const get = (idx: number) => (idx >= 0 ? (c[idx] ?? "").trim() : "");
    rows.push({
      line: i + 1,
      name: get(cols.name),
      email: get(cols.email).toLowerCase(),
      phone: get(cols.phone),
      active: parseActive(cols.active >= 0 ? c[cols.active] : undefined),
    });
  }
  return rows;
}

// Bestand lezen als UTF-8; lukt dat niet (Excel slaat "CSV" vaak op als Windows-1252),
// dan als Windows-1252, zodat é, ë enz. goed blijven.
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
