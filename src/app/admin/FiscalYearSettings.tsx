"use client";

import { useEffect, useState } from "react";

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

// In welke maand het boekjaar begint (tab Betalingen toont en exporteert per boekjaar).
export default function FiscalYearSettings() {
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/payments")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setSaved(data.startMonth);
        setValue(data.startMonth);
      });
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMonth: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setSaved(data.startMonth);
    setMessage({ ok: true, text: "Opgeslagen." });
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">Boekjaar</h2>
      <p className="text-sm text-gray-600 mb-4">
        De tab Betalingen toont en downloadt per boekjaar. Er wordt nooit iets verwijderd: oudere
        boekjaren blijven op te vragen.
      </p>
      {saved === null ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="block font-medium text-gray-700 mb-1">Boekjaar begint in</span>
            <select
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-base"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={save}
            disabled={busy || value === saved}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Opslaan..." : "Opslaan"}
          </button>
          {message && (
            <span className={message.ok ? "text-green-700" : "text-red-700"}>{message.text}</span>
          )}
        </div>
      )}
    </section>
  );
}
