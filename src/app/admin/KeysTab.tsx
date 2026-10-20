"use client";

import { useEffect, useState } from "react";
import { KEY_STATUSES, type AccessKey, type KeyStatus } from "@/lib/keys";

type MemberLite = { name: string; active: boolean };

type Draft = {
  key_number: string;
  alarm_tag: string;
  holder: string;
  status: KeyStatus;
  note: string;
};

const EMPTY: Draft = { key_number: "", alarm_tag: "", holder: "", status: "uitgegeven", note: "" };

const STATUS_STYLE: Record<KeyStatus, string> = {
  uitgegeven: "bg-green-100 text-green-800",
  beschikbaar: "bg-blue-100 text-blue-800",
  geblokkeerd: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<KeyStatus, string> = {
  uitgegeven: "Uitgegeven",
  beschikbaar: "Niet uitgegeven",
  geblokkeerd: "Verloren / geblokkeerd",
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm";

// Beheer > Sleutels: welke sleutel en alarmtag heeft wie. Alleen administratie; de
// sleutels zelf worden fysiek uitgegeven. "Bij" is bij voorkeur de bandnaam zoals in de
// ledenlijst, dan ziet beheer het ook bij die band en valt op als de band geen lid meer is.
export default function KeysTab({ onChanged }: { onChanged?: () => void }) {
  const [keys, setKeys] = useState<AccessKey[] | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [keysRes, membersRes] = await Promise.all([
      fetch("/api/admin/keys"),
      fetch("/api/admin/members"),
    ]);
    const keysData = await keysRes.json().catch(() => ({}));
    if (!keysRes.ok) {
      setError(keysData.error || "Kon de sleutels niet ophalen");
      setKeys([]);
      return;
    }
    setError("");
    setKeys(keysData);
    if (membersRes.ok) setMembers(await membersRes.json());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/admin/keys"), fetch("/api/admin/members")]).then(
      async ([keysRes, membersRes]) => {
        if (cancelled) return;
        const keysData = await keysRes.json().catch(() => ({}));
        if (!keysRes.ok) {
          setError(keysData.error || "Kon de sleutels niet ophalen");
          setKeys([]);
          return;
        }
        setKeys(keysData);
        if (membersRes.ok) setMembers(await membersRes.json());
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const bandNames = Array.from(new Set(members.map((m) => m.name))).sort((a, b) => a.localeCompare(b));
  const activeBands = new Set(members.filter((m) => m.active).map((m) => m.name.toLowerCase()));
  const knownBands = new Set(members.map((m) => m.name.toLowerCase()));
  // Uitgegeven aan een band die in de ledenlijst staat maar geen actief lid meer heeft.
  const shouldReturn = (k: AccessKey) =>
    k.status === "uitgegeven" &&
    !!k.holder &&
    knownBands.has(k.holder.toLowerCase()) &&
    !activeBands.has(k.holder.toLowerCase());

  function startEdit(k: AccessKey | null) {
    setError("");
    setEditing(k ? k.id : "new");
    setDraft(
      k
        ? {
            key_number: k.key_number,
            alarm_tag: k.alarm_tag ?? "",
            holder: k.holder ?? "",
            status: k.status,
            note: k.note ?? "",
          }
        : EMPTY
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/keys" : `/api/admin/keys/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Opslaan is niet gelukt");
      return;
    }
    setEditing(null);
    await load();
    onChanged?.();
  }

  async function remove(k: AccessKey) {
    if (
      !confirm(
        `Sleutel ${k.key_number} uit het overzicht verwijderen? Is hij verloren, zet hem dan liever op "Verloren / geblokkeerd".`
      )
    )
      return;
    const res = await fetch(`/api/admin/keys/${k.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Verwijderen is niet gelukt");
      return;
    }
    setEditing(null);
    await load();
    onChanged?.();
  }

  const form = (
    <form onSubmit={save} className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Sleutelnummer *</span>
          <input
            required
            value={draft.key_number}
            onChange={(e) => setDraft({ ...draft, key_number: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Alarmtag</span>
          <input
            value={draft.alarm_tag}
            onChange={(e) => setDraft({ ...draft, alarm_tag: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="text-sm col-span-2">
          <span className="block font-medium text-gray-700 mb-1">Status</span>
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as KeyStatus })}
            className={inputClass}
          >
            {KEY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm block">
        <span className="block font-medium text-gray-700 mb-1">
          Bij {draft.status === "uitgegeven" ? "*" : "(of: waar ligt hij)"}
        </span>
        <input
          list="key-holders"
          required={draft.status === "uitgegeven"}
          value={draft.holder}
          onChange={(e) => setDraft({ ...draft, holder: e.target.value })}
          placeholder="Bandnaam uit de ledenlijst, of bv. Soulex (Kimberly)"
          className={inputClass}
        />
        <datalist id="key-holders">
          {bandNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <label className="text-sm block">
        <span className="block font-medium text-gray-700 mb-1">Opmerking</span>
        <input
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="Bv. opbergkast, ligt bij Teun, verloren op ..."
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Opslaan..." : "Opslaan"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800"
        >
          Annuleren
        </button>
      </div>
    </form>
  );

  const counts = KEY_STATUSES.map((s) => ({ s, n: (keys ?? []).filter((k) => k.status === s).length }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">Sleutels en alarmtags</h2>
        {editing !== "new" && (
          <button
            onClick={() => startEdit(null)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Sleutel
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Wie heeft welke sleutel. Gebruik bij &quot;Bij&quot; de bandnaam uit de ledenlijst: dan staat
        de sleutel ook bij die band, en zie je hier wanneer een band geen lid meer is en de
        sleutel terug moet. Alleen zichtbaar voor beheer.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>
      )}

      {editing === "new" && <div className="mb-4">{form}</div>}

      {!keys ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          Nog geen sleutels ingevoerd.
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {counts.map(({ s, n }) => `${STATUS_LABEL[s].toLowerCase()}: ${n}`).join(" · ")}
          </p>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {keys.map((k) =>
              editing === k.id ? (
                <div key={k.id} className="p-3">
                  {form}
                  <button
                    onClick={() => remove(k)}
                    className="mt-2 text-xs text-red-600 hover:text-red-700"
                  >
                    Sleutel uit het overzicht verwijderen
                  </button>
                </div>
              ) : (
                <div key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-12 shrink-0 font-semibold text-gray-900">🔑 {k.key_number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">
                      {k.holder || <span className="text-gray-400">niemand</span>}
                      <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[k.status]}`}>
                        {STATUS_LABEL[k.status]}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {k.alarm_tag ? `alarmtag ${k.alarm_tag}` : "geen alarmtag"}
                      {k.note ? ` · ${k.note}` : ""}
                    </p>
                    {shouldReturn(k) && (
                      <p className="text-xs text-amber-700">⚠ Deze band is geen actief lid meer: sleutel terug?</p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(k)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
                  >
                    wijzig
                  </button>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
