"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

type Terms = { graceDays: number; min: number; max: number };

// Vervaltermijn van vaste reserveringen: zoveel dagen na de vervaldatum vervalt de
// reservering (en komen alle volgende repetities vrij) als er nog niet betaald is.
export default function PaymentTermsSettings() {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/payment-terms")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Terms | null) => {
        if (!data) return;
        setTerms(data);
        setValue(data.graceDays);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) return;
    if (
      !confirm(
        `Vervaltermijn wijzigen van ${terms.graceDays} naar ${value} dagen? Dit geldt voor nieuwe betaalverzoeken; al verstuurde verzoeken houden hun termijn.`
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/payment-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graceDays: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setTerms(data);
    setValue(data.graceDays);
    setMessage({ ok: true, text: "Opgeslagen." });
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">Vervaltermijn vaste reservering</h2>
      <p className="text-sm text-gray-600 mb-4">
        Bands betalen per {config.periodWeeks} weken vooraf. Is er zoveel dagen na de
        vervaldatum nog niet betaald, dan vervalt de vaste reservering en komen alle volgende
        repetities vrij voor anderen. Bands zien deze termijn bij hun jaarplanning en in de
        bevestigingsmail.
      </p>

      {!terms ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="block font-medium text-gray-700 mb-1">Termijn</span>
            <select
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-base"
            >
              {Array.from({ length: terms.max - terms.min + 1 }, (_, i) => terms.min + i).map(
                (d) => (
                  <option key={d} value={d}>
                    {d} dagen
                  </option>
                )
              )}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || value === terms.graceDays}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Opslaan..." : "Termijn opslaan"}
          </button>
          {message && (
            <span className={message.ok ? "text-green-700" : "text-red-700"}>{message.text}</span>
          )}
        </form>
      )}
    </section>
  );
}
