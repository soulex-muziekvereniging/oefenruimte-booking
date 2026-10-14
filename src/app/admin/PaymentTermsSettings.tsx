"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

type Terms = {
  graceDays: number;
  cancelDays: number;
  min: number;
  max: number;
  cancelMin: number;
  cancelMax: number;
};

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

// Betaal- en afmeldregels van de vaste plek: afmeldtermijn (tot wanneer een band gratis
// annuleert) en vervaltermijn (zoveel dagen na de rekening vervalt de vaste plek als er nog
// niet betaald is).
export default function PaymentTermsSettings() {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [grace, setGrace] = useState(0);
  const [cancel, setCancel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/payment-terms")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Terms | null) => {
        if (!data) return;
        setTerms(data);
        setGrace(data.graceDays);
        setCancel(data.cancelDays);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) return;
    const changes = [
      cancel !== terms.cancelDays && `afmeldtermijn van ${terms.cancelDays} naar ${cancel} dagen`,
      grace !== terms.graceDays &&
        `vervaltermijn van ${terms.graceDays} naar ${grace} dagen (geldt voor nieuwe rekeningen)`,
    ].filter(Boolean);
    if (!confirm(`Wijzigen: ${changes.join(" en ")}?`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/payment-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graceDays: grace, cancelDays: cancel }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setTerms(data);
    setGrace(data.graceDays);
    setCancel(data.cancelDays);
    setMessage({ ok: true, text: "Opgeslagen." });
  }

  const selectClass = "px-3 py-2 border border-gray-300 rounded-lg text-base";

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">Afmelden en betalen vaste plek</h2>
      <p className="text-sm text-gray-600 mb-4">
        Bands betalen achteraf per {config.periodWeeks} weken, alleen voor de keren dat ze
        kwamen. Een repetitie annuleren kan tot de <strong>afmeldtermijn</strong>; later
        annuleren of niet komen wordt wel gerekend. Is de rekening na de{" "}
        <strong>vervaltermijn</strong> nog niet betaald, dan vervalt de vaste plek en komen alle
        volgende repetities vrij voor anderen.
      </p>

      {!terms ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="block font-medium text-gray-700 mb-1">Afmeldtermijn</span>
            <select value={cancel} onChange={(e) => setCancel(Number(e.target.value))} className={selectClass}>
              {range(terms.cancelMin, terms.cancelMax).map((d) => (
                <option key={d} value={d}>
                  {d} dagen vooraf
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-medium text-gray-700 mb-1">Vervaltermijn</span>
            <select value={grace} onChange={(e) => setGrace(Number(e.target.value))} className={selectClass}>
              {range(terms.min, terms.max).map((d) => (
                <option key={d} value={d}>
                  {d} dagen na de rekening
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || (grace === terms.graceDays && cancel === terms.cancelDays)}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Opslaan..." : "Opslaan"}
          </button>
          {message && (
            <span className={message.ok ? "text-green-700" : "text-red-700"}>{message.text}</span>
          )}
        </form>
      )}
    </section>
  );
}
