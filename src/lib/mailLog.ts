import { supabase } from "./supabase";

// Verzendlog van de mails die de dagelijkse cron aan bands stuurt (rekeningen, herinneringen,
// waarschuwingen, vervalmeldingen), zodat het beheer in de tab Betalingen kan zien of alles
// de deur uit is en naar welke adressen. Bewaard als één rij in de tabel settings (key
// "mail_log", geen migratie nodig): de laatste run plus de laatste MAX_ENTRIES regels.
// "Verstuurd" betekent: Resend heeft de mail aangenomen. Of hij ook echt is aangekomen (of
// teruggestuurd door een fout adres), staat in het Resend-dashboard.
const KEY = "mail_log";
const MAX_ENTRIES = 300;

export type MailKind = "rekening" | "herinnering" | "waarschuwing" | "vervallen";

export type MailLogEntry = {
  at: string;
  kind: MailKind;
  band: string;
  period: string | null; // "2026-11-03 t/m 2026-11-30"
  to: string[];
  ok: boolean;
  error?: string;
};

export type MailRun = {
  at: string;
  skipped?: string; // reden dat er niets gecontroleerd is (bv. rekeningen staan uit)
  sent: number;
  failed: number;
};

export type MailLog = { lastRun: MailRun | null; entries: MailLogEntry[] };

export async function getMailLog(): Promise<MailLog> {
  const { data } = await supabase.from("settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data?.value ?? {}) as Partial<MailLog>;
  return {
    lastRun: v.lastRun ?? null,
    entries: Array.isArray(v.entries) ? v.entries : [],
  };
}

// Aan het eind van elke cronrun: de run vastleggen en de nieuwe regels bovenaan zetten.
// Mag de cron nooit laten mislukken, dus fouten alleen loggen.
export async function saveMailRun(run: { at: string; skipped?: string }, newEntries: MailLogEntry[]) {
  try {
    const old = await getMailLog();
    const value: MailLog = {
      lastRun: {
        ...run,
        sent: newEntries.filter((e) => e.ok).length,
        failed: newEntries.filter((e) => !e.ok).length,
      },
      entries: [...newEntries.slice().reverse(), ...old.entries].slice(0, MAX_ENTRIES),
    };
    const { error } = await supabase
      .from("settings")
      .upsert({ key: KEY, value, updated_at: new Date().toISOString(), updated_by: "cron" });
    if (error) console.error("[mail-log] opslaan mislukt:", error);
  } catch (err) {
    console.error("[mail-log] opslaan mislukt:", err);
  }
}

// Losse mail buiten de cron om (bijv. een aangepaste rekening vanuit het beheer) aan de
// verzendlog toevoegen, zonder de gegevens van de laatste cronrun te veranderen.
export async function appendMailLog(newEntries: MailLogEntry[]) {
  if (newEntries.length === 0) return;
  try {
    const old = await getMailLog();
    const value: MailLog = {
      lastRun: old.lastRun,
      entries: [...newEntries.slice().reverse(), ...old.entries].slice(0, MAX_ENTRIES),
    };
    const { error } = await supabase
      .from("settings")
      .upsert({ key: KEY, value, updated_at: new Date().toISOString(), updated_by: "beheer" });
    if (error) console.error("[mail-log] opslaan mislukt:", error);
  } catch (err) {
    console.error("[mail-log] opslaan mislukt:", err);
  }
}
