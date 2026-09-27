import { config } from "@/config";
import { supabase } from "./supabase";
import { todayStr } from "./date";
import { formatRhythm } from "./schedule";

// Werklijst voor het handmatig overnemen van reserveringen in de zalenplanner van De Borgh
// (VirtueelPlein, ruimte 0.37 - daar is geen koppeling mee). We vergelijken wat er nu
// gepland staat met wat de beheerder als "verwerkt" heeft gemarkeerd (tabel borgh_sync).

export type PlannerItem = {
  key: string;
  state: string; // wijzigt zodra er iets relevants verandert
  description: string;
  sortDate: string;
  endsOn: string | null; // na deze dag is het item niet meer relevant
};

export type WorkItem = {
  key: string;
  status: "nieuw" | "gewijzigd" | "verwijderen";
  description: string;
  previous?: string; // wat er eerder in de planner is gezet (bij gewijzigd)
  sortDate: string;
};

function short(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function hours(startHour: number): string {
  const end = startHour + config.slotDurationMinutes / 60;
  return `${String(startHour).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`;
}

function dagdeelLabel(id: string): string {
  const d = config.dagdelen.find((x) => x.id === id);
  return d ? `${d.label.toLowerCase()} (${hours(d.startHour)})` : id;
}

function dagdeelByTime(time: string): string {
  const d = config.dagdelen.find((x) => x.startHour === parseInt(time.slice(0, 2), 10));
  return d ? dagdeelLabel(d.id) : time.slice(0, 5);
}

export async function currentPlannerItems(): Promise<PlannerItem[]> {
  const today = todayStr();
  const items: PlannerItem[] = [];

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, band_name, weekday, dagdeel_id, frequency, start_date, active_until, status")
    .or(`status.eq.active,and(status.eq.cancelled,active_until.gte.${today})`);
  for (const s of subs ?? []) {
    items.push({
      key: `sub:${s.id}`,
      state: [s.frequency, s.weekday, s.dagdeel_id, s.start_date, s.active_until ?? ""].join("|"),
      description:
        `${s.band_name}: vaste reservering, ${formatRhythm(s)} - ${dagdeelLabel(s.dagdeel_id)}, vanaf ${short(s.start_date)}` +
        (s.active_until ? `, t/m ${short(s.active_until)} (opgezegd)` : ""),
      sortDate: s.start_date > today ? s.start_date : today,
      endsOn: s.active_until,
    });
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, band_name, slot_date, slot_start_time")
    .eq("status", "confirmed")
    .gte("slot_date", today);
  for (const b of bookings ?? []) {
    items.push({
      key: `booking:${b.id}`,
      state: `${b.slot_date}|${b.slot_start_time}`,
      description: `${b.band_name}: losse boeking ${short(b.slot_date)}, ${dagdeelByTime(b.slot_start_time)}`,
      sortDate: b.slot_date,
      endsOn: b.slot_date,
    });
  }

  const subIds = (subs ?? []).map((s) => s.id);
  if (subIds.length > 0) {
    const { data: swaps } = await supabase
      .from("subscription_swaps")
      .select("id, subscription_id, original_date, new_date, new_dagdeel_id")
      .in("subscription_id", subIds)
      .or(`original_date.gte.${today},new_date.gte.${today}`);
    for (const sw of swaps ?? []) {
      const band = (subs ?? []).find((s) => s.id === sw.subscription_id)?.band_name ?? "";
      const dates = [sw.original_date, sw.new_date ?? sw.original_date].sort();
      items.push({
        key: `swap:${sw.id}`,
        state: `${sw.original_date}|${sw.new_date ?? ""}|${sw.new_dagdeel_id ?? ""}`,
        description:
          `${band}: repetitie van ${short(sw.original_date)} verplaatst naar ` +
          (sw.new_date ? `${short(sw.new_date)}, ${dagdeelLabel(sw.new_dagdeel_id ?? "")}` : "(vervallen)"),
        sortDate: dates[0],
        endsOn: dates[1],
      });
    }
  }

  return items;
}

export async function workList(): Promise<WorkItem[]> {
  const today = todayStr();
  const items = await currentPlannerItems();
  const { data: synced, error } = await supabase.from("borgh_sync").select("*");
  if (error) throw new Error(error.message);
  const syncedByKey = new Map((synced ?? []).map((r) => [r.item_key as string, r]));

  const work: WorkItem[] = [];
  for (const item of items) {
    const row = syncedByKey.get(item.key);
    if (!row) {
      work.push({ key: item.key, status: "nieuw", description: item.description, sortDate: item.sortDate });
    } else if (row.state !== item.state) {
      work.push({
        key: item.key,
        status: "gewijzigd",
        description: item.description,
        previous: row.description,
        sortDate: item.sortDate,
      });
    }
  }

  // Eerder overgenomen, maar nu niet meer gepland (geannuleerd, opgezegd, verplaatsing
  // teruggedraaid): uit de planner halen. Items waarvan de datum al voorbij is, vallen stil weg.
  const currentKeys = new Set(items.map((i) => i.key));
  for (const row of synced ?? []) {
    if (currentKeys.has(row.item_key)) continue;
    if (row.ends_on && row.ends_on < today) continue;
    work.push({ key: row.item_key, status: "verwijderen", description: row.description, sortDate: today });
  }

  const order = { verwijderen: 0, gewijzigd: 1, nieuw: 2 };
  return work.sort((a, b) => order[a.status] - order[b.status] || a.sortDate.localeCompare(b.sortDate));
}

// Markeer items als verwerkt in de zalenplanner (bij "verwijderen": als verwijderd).
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
  // Opruimen: rijen van items die al voorbij zijn.
  await supabase.from("borgh_sync").delete().lt("ends_on", todayStr());
}
