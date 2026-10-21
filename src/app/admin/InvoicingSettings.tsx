"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

type Setting = { enabled: boolean; fromDate: string | null };

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Schakelaar "Rekeningen vaste plek": pas als die aan staat, gaan er rekeningen (en
// herinneringen) naar de bands. Zo kan het bestuur de vaste plekken alvast invoeren.
export default function InvoicingSettings() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/invoicing")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Setting | null) => {
        if (!data) return;
        setSetting(data);
        setFromDate(data.fromDate ?? "");
      });
  }, []);

  async function save(enabled: boolean) {
    const question = enabled
      ? `Rekeningen AANZETTEN, vanaf ${formatDate(fromDate)}?\n\nVanaf de volgende ochtend krijgen bands per mail een rekening voor elke periode die op of na deze datum begint (een week van tevoren). Staat Mollie op live en weten de bands ervan?`
      : "Rekeningen UITZETTEN? Er gaan dan geen rekeningen, herinneringen of vervalmeldingen meer uit tot je ze weer aanzet.";
    if (!confirm(question)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/invoicing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, fromDate: fromDate || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setSetting(data);
    setMessage({ ok: true, text: enabled ? "Rekeningen staan aan." : "Rekeningen staan uit." });
  }

  return (
    <section
      className={`rounded-lg border p-4 sm:p-5 ${
        setting?.enabled ? "bg-white border-gray-200" : "bg-amber-50 border-amber-300"
      }`}
    >
      <h2 className="text-lg font-bold mb-1">Rekeningen vaste plek</h2>
      {!setting ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <>
          <p className="text-sm mb-3">
            {setting.enabled ? (
              <span className="text-green-800">
                <strong>Aan</strong>, factureren vanaf {formatDate(setting.fromDate!)}. Een week voor
                elke periode van {config.periodWeeks} weken krijgen bands een rekening per mail.
              </span>
            ) : (
              <span className="text-amber-900">
                <strong>Uit.</strong> Er gaan geen rekeningen, herinneringen of vervalmeldingen naar
                de bands. Zet dit pas aan als Mollie op live staat en de bands weten dat de rekening
                per mail komt.
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>
              <span className="block font-medium text-gray-700 mb-1">Factureren vanaf</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-base"
              />
            </label>
            {setting.enabled ? (
              <button
                onClick={() => save(false)}
                disabled={busy}
                className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Uitzetten
              </button>
            ) : (
              <button
                onClick={() => save(true)}
                disabled={busy || !fromDate}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Opslaan..." : "Aanzetten"}
              </button>
            )}
            {setting.enabled && fromDate !== setting.fromDate && (
              <button
                onClick={() => save(true)}
                disabled={busy || !fromDate}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Datum opslaan
              </button>
            )}
            {message && (
              <span className={message.ok ? "text-green-700" : "text-red-700"}>{message.text}</span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Elke band krijgt een rekening voor de eerste periode die <strong>op of na</strong> deze
            datum begint (periodes lopen per band vanaf de eigen startdatum). Repetities daarvoor
            komen op geen rekening; die regelen jullie zoals tot nu toe.
          </p>
        </>
      )}
    </section>
  );
}
