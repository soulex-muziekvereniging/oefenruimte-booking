"use client";

import { useEffect, useState } from "react";

function label(weeks: number): string {
  const months: Record<number, string> = { 4: "1 maand", 8: "2 maanden", 13: "3 maanden", 26: "een half jaar" };
  return `${weeks} weken${months[weeks] ? ` (${months[weeks]})` : ""}`;
}

// Hoe ver vooruit leden los kunnen boeken en een vaste plek kunnen laten starten.
export default function BookingHorizonSettings() {
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState(4);
  const [options, setOptions] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/booking-horizon")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setSaved(data.weeks);
        setValue(data.weeks);
        setOptions(data.options);
      });
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/booking-horizon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeks: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setSaved(data.weeks);
    setMessage({ ok: true, text: "Opgeslagen." });
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">Vooruit boeken</h2>
      <p className="text-sm text-gray-600 mb-4">
        Hoe ver vooruit leden een losse boeking kunnen maken of een vaste plek kunnen laten
        starten. Als beheer kun je zelf altijd verder vooruit plannen.
      </p>
      {saved === null ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="block font-medium text-gray-700 mb-1">Leden boeken tot</span>
            <select
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-base"
            >
              {options.map((w) => (
                <option key={w} value={w}>
                  {label(w)} vooruit
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
