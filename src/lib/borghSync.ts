import { config } from "@/config";
import { supabase } from "./supabase";
import { nowInAmsterdam, todayStr } from "./date";
import { formatRhythm, occursOn, type SubscriptionPattern } from "./schedule";
import { sendBorghFreedEmail } from "./email";

// Werklijst voor het handmatig overnemen van reserveringen in de zalenplanner van De Borgh
// (VirtueelPlein, ruimte 0.37 - daar is geen koppeling mee). De Borgh wil alleen weten
// wánneer er iemand is, niet wie. Daarom rekenen we per bezet dagdeel:
// - elke vaste reservering staat er als reeks in ("sub:<id>");
// - losse data wijken daarvan af: bezet zonder reeks ("extra:<datum>|<dagdeel>") of een
//   reeks-keer waarop niemand komt ("vrij:<datum>|<dagdeel>").
// Wisselt alleen de band (verplaatsing naar een dagdeel dat een ander vrijmaakte), dan
// verandert er voor De Borgh niets en komt het ook niet op de lijst.
// Toevoegen doet de beheerder zelf in de zalenplanner; verwijderen moet via De Borgh
// (mail). We vergelijken met wat als "verwerkt" is gemarkeerd (tabel borgh_sync).

export const BORGH_ROOM_ID = 2; // 0.37 Pop-oefenruimte in de zalenplanner van De Borgh
const BORGH_BASE = "https://deborghbudel.nl/mrbs";

export type PlannerItem = {
  key: string;
  state: string; // wijzigt zodra er iets relevants verandert
  description: string;
  sortDate: string;
  endsOn: string | null; // na deze dag is het item niet meer relevant
  seriesKeys?: string[]; // bij "vrij": de reeks(en) waar deze keer bij hoort
};

export type WorkItem = {
  key: string;
  status: "nieuw" | "gewijzigd" | "verwijderen";
  description: string;
  previous?: string; // wat er eerder in de planner is gezet (bij gewijzigd)
  sortDate: string;
  addUrl?: string; // invulformulier van De Borgh, datum/tijd/ruimte al ingevuld
  addNote?: string; // wat erbij moet (bijv. herhalen)
  mailLine?: string; // wat De Borgh eruit moet halen
  autoMail?: boolean; // mag automatisch naar De Borgh (alleen "ruimte komt vrij")
  today?: boolean; // gaat over vandaag: dan meteen mailen, anders de volgende ochtend
};

type SubRow = SubscriptionPattern & { id: string; band_name: string };

function short(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function long(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function hours(startHour: number): string {
  const end = startHour + config.slotDurationMinutes / 60;
  return `${String(startHour).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`;
}

function dagdeel(id: string) {
  return config.dagdelen.find((x) => x.id === id);
}

function dagdeelLabel(id: string): string {
  const d = dagdeel(id);
  return d ? `${d.label.toLowerCase()} (${hours(d.startHour)})` : id;
}

function dagdeelHours(id: string): string {
  const d = dagdeel(id);
  return d ? hours(d.startHour) : id;
}

function dagdeelIdByTime(time: string): string | null {
  const hour = parseInt(time.slice(0, 2), 10);
  return config.dagdelen.find((x) => x.startHour === hour)?.id ?? null;
}

export function borghWeekUrl(date = todayStr()): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${BORGH_BASE}/Default.aspx?display=week&year=${y}&month=${m}&day=${d}&room=${BORGH_ROOM_ID}`;
}

function borghAddUrl(date: string, dagdeelId: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const hour = dagdeel(dagdeelId)?.startHour ?? 0;
  return (
    `${BORGH_BASE}/Entry.aspx?action=newedit&display=day&year=${y}&month=${m}&day=${d}` +
    `&hour=${hour}&minute=0&room=${BORGH_ROOM_ID}&id=0`
  );
}

function firstOccurrenceFrom(s: SubscriptionPattern, from: string): string {
  if (s.start_date >= from) return s.start_date;
  const d = new Date(from + "T12:00:00Z");
  for (let i = 0; i < 14; i++) {
    const date = d.toISOString().slice(0, 10);
    if (occursOn(s, date)) return date;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return from;
}

function seriesState(s: SubRow): string {
  return [s.frequency, s.weekday, s.dagdeel_id, s.start_date, s.active_until ?? ""].join("|");
}

function parseSeriesState(state: string) {
  const [frequency, weekday, dagdeel_id, start_date, active_until] = state.split("|");
  return { frequency, weekday, dagdeel_id, start_date, active_until };
}

function seriesText(s: Pick<SubscriptionPattern, "weekday" | "dagdeel_id" | "frequency">): string {
  return `${formatRhythm(s)} (${dagdeelHours(s.dagdeel_id)})`;
}

function oldSeriesText(state: string): string {
  const s = parseSeriesState(state);
  return seriesText({
    weekday: Number(s.weekday),
    dagdeel_id: s.dagdeel_id,
    frequency: s.frequency as SubscriptionPattern["frequency"],
  });
}

async function loadSubscriptions(today: string): Promise<SubRow[]> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, band_name, weekday, dagdeel_id, frequency, start_date, active_until, status")
    .or(`status.eq.active,and(status.eq.cancelled,active_until.gte.${today})`);
  return (data ?? []) as SubRow[];
}

async function plannerItemsFor(subs: SubRow[], today: string): Promise<PlannerItem[]> {
  const items: PlannerItem[] = [];

  for (const s of subs) {
    items.push({
      key: `sub:${s.id}`,
      state: seriesState(s),
      description:
        `Reeks ${seriesText(s)}, vanaf ${short(s.start_date)}` +
        (s.active_until ? ` t/m ${short(s.active_until)}` : "") +
        ` (nu: ${s.band_name})`,
      sortDate: s.start_date > today ? s.start_date : today,
      endsOn: s.active_until ?? null,
    });
  }

  // Afwijkingen per datum: alleen data met een losse boeking of verplaatsing kunnen
  // afwijken van de reeksen.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("band_name, slot_date, slot_start_time")
    .eq("status", "confirmed")
    .gte("slot_date", today);

  const subIds = subs.map((s) => s.id);
  const { data: swaps } =
    subIds.length > 0
      ? await supabase
          .from("subscription_swaps")
          .select("subscription_id, original_date, new_date, new_dagdeel_id")
          .in("subscription_id", subIds)
          .or(`original_date.gte.${today},new_date.gte.${today}`)
      : { data: [] };

  const occupiedBy = new Map<string, string[]>(); // "datum|dagdeel" -> bandnamen
  const addOccupant = (slot: string, band: string) =>
    occupiedBy.set(slot, [...(occupiedBy.get(slot) ?? []), band]);
  const candidates = new Set<string>();

  for (const b of bookings ?? []) {
    const d = dagdeelIdByTime(b.slot_start_time);
    if (!d) continue;
    const slot = `${b.slot_date}|${d}`;
    candidates.add(slot);
    addOccupant(slot, b.band_name);
  }
  const swappedAway = new Set<string>(); // "subId|datum"
  for (const sw of swaps ?? []) {
    const sub = subs.find((s) => s.id === sw.subscription_id);
    if (!sub) continue;
    swappedAway.add(`${sub.id}|${sw.original_date}`);
    if (sw.original_date >= today) candidates.add(`${sw.original_date}|${sub.dagdeel_id}`);
    if (sw.new_date && sw.new_date >= today) {
      const slot = `${sw.new_date}|${sw.new_dagdeel_id ?? sub.dagdeel_id}`;
      candidates.add(slot);
      addOccupant(slot, sub.band_name);
    }
  }

  for (const slot of candidates) {
    const [date, dagdeelId] = slot.split("|");
    const series = subs.filter((s) => s.dagdeel_id === dagdeelId && occursOn(s, date));
    const occupants = [
      ...(occupiedBy.get(slot) ?? []),
      ...series.filter((s) => !swappedAway.has(`${s.id}|${date}`)).map((s) => s.band_name),
    ];
    const when = `${short(date)}, ${dagdeelLabel(dagdeelId)}`;
    if (series.length > 0 && occupants.length === 0) {
      items.push({
        key: `vrij:${slot}`,
        state: "vrij",
        seriesKeys: series.map((s) => `sub:${s.id}`),
        description: `${when}: niemand aanwezig (reeks van ${series.map((s) => s.band_name).join(", ")} vervalt)`,
        sortDate: date,
        endsOn: date,
      });
    } else if (series.length === 0 && occupants.length > 0) {
      items.push({
        key: `extra:${slot}`,
        state: "extra",
        description: `${when}: extra bezet (${occupants.join(", ")})`,
        sortDate: date,
        endsOn: date,
      });
    }
  }

  return items;
}

export async function currentPlannerItems(): Promise<PlannerItem[]> {
  const today = todayStr();
  return plannerItemsFor(await loadSubscriptions(today), today);
}

function slotOfKey(key: string): { date: string; dagdeelId: string } {
  const [date, dagdeelId] = key.slice(key.indexOf(":") + 1).split("|");
  return { date, dagdeelId };
}

function slotText(date: string, dagdeelId: string): string {
  return `${long(date)}, ${dagdeelLabel(dagdeelId)}`;
}

const KNOWN_PREFIXES = ["sub:", "vrij:", "extra:"];

export async function workList(): Promise<WorkItem[]> {
  const today = todayStr();
  const subList = await loadSubscriptions(today);
  const subs = new Map(subList.map((s) => [`sub:${s.id}`, s]));
  const items = await plannerItemsFor(subList, today);
  const { data: synced, error } = await supabase.from("borgh_sync").select("*");
  if (error) throw new Error(error.message);
  const rows = (synced ?? []).filter((r) =>
    KNOWN_PREFIXES.some((p) => (r.item_key as string).startsWith(p))
  );
  const syncedByKey = new Map(rows.map((r) => [r.item_key as string, r]));

  const work: WorkItem[] = [];
  for (const item of items) {
    const row = syncedByKey.get(item.key);
    if (row && row.state === item.state) continue;
    const base = { key: item.key, description: item.description, sortDate: item.sortDate };

    if (item.key.startsWith("sub:")) {
      const s = subs.get(item.key)!;
      const addSeries = {
        addUrl: borghAddUrl(firstOccurrenceFrom(s, today), s.dagdeel_id),
        addNote:
          `Herhalen: ${s.frequency === "biweekly" ? "om de week" : "elke week"}` +
          (s.active_until ? `, t/m ${short(s.active_until)}` : ""),
      };
      if (!row) {
        work.push({ ...base, status: "nieuw", ...addSeries });
        continue;
      }
      const old = parseSeriesState(row.state);
      const onlyEndChanged =
        old.frequency === s.frequency &&
        Number(old.weekday) === s.weekday &&
        old.dagdeel_id === s.dagdeel_id &&
        old.start_date === s.start_date;
      if (onlyEndChanged && s.active_until) {
        work.push({
          ...base,
          status: "gewijzigd",
          previous: row.description,
          mailLine: `Reeks ${seriesText(s)}: laatste keer op ${long(s.active_until)}, de keren daarna graag verwijderen.`,
        });
      } else {
        // Ritme gewijzigd (of opzegging teruggedraaid): oude reeks eruit, nieuwe erin.
        work.push({
          ...base,
          status: "gewijzigd",
          previous: row.description,
          mailLine: `Reeks ${oldSeriesText(row.state)} graag helemaal verwijderen (wordt vervangen).`,
          ...addSeries,
        });
      }
    } else {
      const { date, dagdeelId } = slotOfKey(item.key);
      if (item.key.startsWith("extra:")) {
        work.push({ ...base, status: "nieuw", addUrl: borghAddUrl(date, dagdeelId) });
      } else {
        work.push({
          ...base,
          status: "nieuw",
          mailLine: `${slotText(date, dagdeelId)}: niemand aanwezig, graag verwijderen.`,
        });
      }
    }
  }

  // Eerder verwerkt, maar nu niet meer van toepassing. Items waarvan de datum al voorbij
  // is, vallen stil weg.
  const currentKeys = new Set(items.map((i) => i.key));
  for (const row of rows) {
    if (currentKeys.has(row.item_key)) continue;
    if (row.ends_on && row.ends_on < today) continue;
    if (row.item_key.startsWith("sub:")) {
      work.push({
        key: row.item_key,
        status: "verwijderen",
        sortDate: today,
        description: row.description,
        mailLine: `Reeks ${oldSeriesText(row.state)} graag helemaal verwijderen.`,
      });
      continue;
    }
    const { date, dagdeelId } = slotOfKey(row.item_key);
    const when = `${short(date)}, ${dagdeelLabel(dagdeelId)}`;
    if (row.item_key.startsWith("extra:")) {
      work.push({
        key: row.item_key,
        status: "verwijderen",
        sortDate: date,
        description: `${when}: toch niemand aanwezig`,
        mailLine: `${slotText(date, dagdeelId)}: niemand aanwezig, graag verwijderen.`,
      });
    } else {
      // Eerder als "niemand aanwezig" doorgegeven, nu toch weer bezet: opnieuw invullen.
      work.push({
        key: row.item_key,
        status: "gewijzigd",
        sortDate: date,
        description: `${when}: toch weer bezet`,
        addUrl: borghAddUrl(date, dagdeelId),
      });
    }
  }

  // Wat alleen "de ruimte komt vrij" doorgeeft, mag automatisch naar De Borgh. Een vrij
  // gekomen keer van een reeks alleen als die reeks al in hun planner staat, en alleen
  // zolang het dagdeel nog niet begonnen is.
  const syncedKeys = new Set(rows.map((r) => r.item_key as string));
  const itemByKey = new Map(items.map((i) => [i.key, i]));
  const nowHour = nowInAmsterdam().getHours();
  for (const w of work) {
    if (!w.mailLine || w.addUrl) continue;
    if (w.key.startsWith("sub:")) {
      w.autoMail = true;
      continue;
    }
    const { date, dagdeelId } = slotOfKey(w.key);
    const started =
      date < today || (date === today && (dagdeel(dagdeelId)?.startHour ?? 0) <= nowHour);
    if (started) continue;
    w.autoMail = w.key.startsWith("vrij:")
      ? (itemByKey.get(w.key)?.seriesKeys ?? []).some((k) => syncedKeys.has(k))
      : true;
    w.today = date === today;
  }

  const order = { verwijderen: 0, gewijzigd: 1, nieuw: 2 };
  return work.sort(
    (a, b) => a.sortDate.localeCompare(b.sortDate) || order[a.status] - order[b.status]
  );
}

// Markeer items als verwerkt in de zalenplanner.
export async function markProcessed(keys: string[], by: string) {
  const items = new Map((await currentPlannerItems()).map((i) => [i.key, i]));
  for (const key of keys) {
    const item = items.get(key);
    if (item) {
      await supabase.from("borgh_sync").upsert({
        item_key: key,
        state: item.state,
        description: item.description,
        ends_on: item.endsOn,
        synced_at: new Date().toISOString(),
        synced_by: by,
      });
    } else {
      await supabase.from("borgh_sync").delete().eq("item_key", key);
    }
  }
  // Opruimen: voorbije items en rijen uit de eerdere indeling (per boeking/verplaatsing).
  await supabase.from("borgh_sync").delete().lt("ends_on", todayStr());
  await supabase.from("borgh_sync").delete().like("item_key", "booking:%");
  await supabase.from("borgh_sync").delete().like("item_key", "swap:%");
  await supabase.from("settings").delete().eq("key", "borgh_pending");
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

// Mailadres van De Borgh voor verwijderverzoeken (beheer > Zalenplanner).
export async function getBorghEmail(): Promise<string> {
  const value = await getSetting<unknown>("borgh_email", "");
  return typeof value === "string" ? value : "";
}

// Automatisch doorgeven dat de ruimte vrijkomt (beheer > Zalenplanner). Staat standaard
// uit. Annuleringen voor vandaag gaan meteen, de rest de volgende ochtend in één mail.
export type BorghAuto = { enabled: boolean };

export function parseBorghAuto(input: unknown): BorghAuto {
  const obj = (input ?? {}) as Record<string, unknown>;
  return { enabled: obj.enabled === true };
}

export async function getBorghAuto(): Promise<BorghAuto> {
  return parseBorghAuto(await getSetting<unknown>("borgh_auto", {}));
}

// Tekst van die mail; de lijst met tijden komt tussen aanhef en afsluiting.
export type BorghMailText = { subject: string; intro: string; closing: string };

export function defaultBorghMailText(): BorghMailText {
  return {
    subject: "Oefenruimte 0.37: niemand aanwezig",
    intro:
      "Beste medewerker van De Borgh,\n\nOp de volgende tijden is er niemand in de Pop-oefenruimte (0.37). Willen jullie deze uit de zalenplanner halen?",
    closing: `Alvast bedankt!\n\nMet vriendelijke groet,\n${config.organizationName}`,
  };
}

export function parseBorghMailText(input: unknown): BorghMailText {
  const obj = (input ?? {}) as Record<string, unknown>;
  const d = defaultBorghMailText();
  const clean = (v: unknown, fallback: string, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
  return {
    subject: clean(obj.subject, d.subject, 150),
    intro: clean(obj.intro, d.intro, 1000),
    closing: clean(obj.closing, d.closing, 1000),
  };
}

export async function getBorghMailText(): Promise<BorghMailText> {
  return parseBorghMailText(await getSetting<unknown>("borgh_mail_text", {}));
}

export type BorghMailLog = { at: string; lines: string[] } | null;

export async function getLastBorghMail(): Promise<BorghMailLog> {
  const { data } = await supabase
    .from("settings_history")
    .select("new_value, changed_at")
    .eq("key", "borgh_mail")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const lines = (data.new_value as { lines?: string[] })?.lines ?? [];
  return { at: data.changed_at as string, lines };
}

// Na een annulering of verplaatsing: gaat het om vandaag, dan meteen naar De Borgh (als
// automatisch mailen aan staat). Mag de actie zelf nooit laten mislukken.
export async function noteBorghChanges() {
  try {
    await sendBorghMail("vandaag");
  } catch (err) {
    console.error("[zalenplanner] directe mail aan De Borgh mislukt:", err);
  }
}

// "vandaag": alleen wat over vandaag gaat (direct na een annulering).
// "alles": alles wat klaarstaat (de ochtendronde van de cron).
// Alles van dat moment gaat in één mail; daarna als verwerkt gemarkeerd.
export async function sendBorghMail(
  scope: "vandaag" | "alles"
): Promise<{ sent: number; skipped?: string }> {
  const auto = await getBorghAuto();
  if (!auto.enabled) return { sent: 0, skipped: "automatisch mailen staat uit" };
  const to = await getBorghEmail();
  if (!to) return { sent: 0, skipped: "geen mailadres van De Borgh ingevuld" };

  const due = (await workList()).filter((w) => w.autoMail && (scope === "alles" || w.today));
  if (due.length === 0) return { sent: 0 };

  const lines = due.map((w) => w.mailLine!);
  await sendBorghFreedEmail(to, lines, await getBorghMailText());
  await markProcessed(
    due.map((w) => w.key),
    "automatisch gemaild"
  );
  await supabase.from("settings_history").insert({
    key: "borgh_mail",
    old_value: null,
    new_value: { to, lines },
    changed_by: "automatisch",
  });
  return { sent: due.length };
}
