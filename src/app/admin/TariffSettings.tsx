"use client";

import { useEffect, useState } from "react";
import { TARIFF_LABELS, type Tariffs } from "@/lib/tariffDefaults";

type HistoryRow = {
  old_value: Tariffs | null;
  new_value: Tariffs;
  changed_by: string | null;
  changed_at: string;
};

const KEYS = Object.keys(TARIFF_LABELS) as (keyof Tariffs)[];

function euro(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// "40", "40,00", "€ 40.5" -> centen; null bij ongeldige invoer.
function parseEuro(text: string): number | null {
  const cleaned = text.replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

// Tarieven aanpassen zonder code of deploy. Veiligheid: alleen beheerders, grenzen op de
// bedragen (server), een bevestiging met oud -> nieuw, en een logboek van elke wijziging.
export default function TariffSettings() {
  const [current, setCurrent] = useState<Tariffs | null>(null);
  const [form, setForm] = useState<Record<keyof Tariffs, string> | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/tariffs");
    if (!res.ok) return;
    const data = await res.json();
    setCurrent(data.tariffs);
    setHistory(data.history);
    setForm(
      Object.fromEntries(
        KEYS.map((k) => [k, (data.tariffs[k] / 100).toFixed(2).replace(".", ",")])
      ) as Record<keyof Tariffs, string>
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !current) return;
    setMessage(null);

    const next = {} as Tariffs;
    for (const k of KEYS) {
      const cents = parseEuro(form[k]);
      if (cents === null) {
        setMessage({ ok: false, text: `${TARIFF_LABELS[k]}: geen geldig bedrag` });
        return;
      }
      next[k] = cents;
    }

    const changes = KEYS.filter((k) => next[k] !== current[k]);
    if (changes.length === 0) {
      setMessage({ ok: true, text: "Er is niets veranderd." });
      return;
    }
    const summary = changes
      .map((k) => `${TARIFF_LABELS[k]}: ${euro(current[k])} → ${euro(next[k])}`)
      .join("\n");
    if (
      !confirm(
        `Tarieven wijzigen?\n\n${summary}\n\n` +
          (applyToExisting
            ? "Ook lopende vaste reserveringen krijgen de nieuwe prijs vanaf hun volgende betaalverzoek."
            : "Lopende vaste reserveringen houden hun huidige prijs; de nieuwe prijzen gelden voor nieuwe boekingen en aanvragen.")
      )
    ) {
      return;
    }

    setBusy(true);
    const res = await fetch("/api/admin/tariffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffs: next, applyToExisting }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setMessage({
      ok: true,
      text:
        "Opgeslagen." +
        (applyToExisting
          ? ` ${data.updatedSubscriptions} lopende vaste reservering(en) bijgewerkt.`
          : ""),
    });
    setApplyToExisting(false);
    await load();
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">Tarieven</h2>
      <p className="text-sm text-gray-600 mb-4">
        Nieuwe tarieven gelden direct voor nieuwe boekingen en aanvragen, en staan meteen op de
        site. Elke wijziging wordt vastgelegd.
      </p>

      {!form ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KEYS.map((k) => (
              <label key={k} className="text-sm">
                <span className="block text-gray-700 mb-1">{TARIFF_LABELS[k]}</span>
                <span className="flex items-center gap-1">
                  €
                  <input
                    inputMode="decimal"
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Ook toepassen op lopende vaste reserveringen, vanaf hun volgende betaalverzoek
              <span className="block text-xs text-gray-500">
                Al verstuurde betaalverzoeken blijven zoals ze zijn. Laat de bands het wel even
                weten.
              </span>
            </span>
          </label>

          {message && (
            <div
              className={`p-3 rounded-lg text-sm border ${
                message.ok
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {busy ? "Opslaan..." : "Tarieven opslaan"}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-1">Laatste wijzigingen</p>
          <ul className="text-xs text-gray-600 space-y-1">
            {history.map((h) => (
              <li key={h.changed_at}>
                {new Date(h.changed_at).toLocaleString("nl-NL", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                door {h.changed_by ?? "onbekend"}:{" "}
                {KEYS.filter((k) => !h.old_value || h.old_value[k] !== h.new_value[k])
                  .map(
                    (k) =>
                      `${TARIFF_LABELS[k].split(" (")[0].toLowerCase()} ${
                        h.old_value ? euro(h.old_value[k]) + " → " : ""
                      }${euro(h.new_value[k])}`
                  )
                  .join(", ") || "geen verschil"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
