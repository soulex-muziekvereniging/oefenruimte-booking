"use client";

import { useState } from "react";
import { config } from "@/config";
import { hoursUntilSlot, toLocalDateStr } from "@/lib/date";

type Option = { date: string; dagdeelId: string; label: string };

function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Knoppen in het kalendervenster bij een repetitie van een vaste reservering: namens de
// band deze ene keer verplaatsen (kiezen + bevestigen) of vrijgeven. Zonder de limieten
// die voor bands gelden; de band krijgt een mail.
export default function AdminRepetitionActions({
  subscriptionId,
  date,
  bandName,
  onDone,
}: {
  subscriptionId: string;
  date: string;
  bandName: string;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function openMove() {
    setLoading(true);
    setError("");
    const from = toLocalDateStr(new Date());
    const res = await fetch(`/api/slots?from=${from}&to=${addDays(date, 28)}`);
    const data = await res.json().catch(() => []);
    const list: Option[] = [];
    if (res.ok) {
      for (const day of data as { date: string; slots: { dagdeelId: string; startTime: string; available: boolean }[] }[]) {
        for (const slot of day.slots) {
          if (slot.available && hoursUntilSlot(day.date, slot.startTime) > 0) {
            const label = config.dagdelen.find((d) => d.id === slot.dagdeelId)?.label ?? slot.dagdeelId;
            list.push({ date: day.date, dagdeelId: slot.dagdeelId, label });
          }
        }
      }
    }
    setOptions(list);
    setLoading(false);
  }

  async function submit(newDate: string | null, newDagdeelId: string | null) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/subscriptions/${subscriptionId}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalDate: date, newDate, newDagdeelId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Dat is niet gelukt");
      return;
    }
    onDone();
  }

  function release() {
    if (
      confirm(
        `${bandName} komt ${shortDate(date)} niet?\n\nDeze keer vrijgeven: het dagdeel komt vrij voor anderen en de band krijgt een mail. De vaste reservering loopt verder gewoon door.`
      )
    ) {
      submit(null, null);
    }
  }

  return (
    <div className="w-full">
      {options === null ? (
        <div className="flex gap-2">
          <button
            onClick={openMove}
            disabled={loading || busy}
            className="flex-1 px-4 py-2.5 bg-white border border-blue-300 text-blue-700 rounded-lg font-medium hover:bg-blue-50 text-sm disabled:opacity-50"
          >
            {loading ? "Laden..." : "Deze keer verplaatsen"}
          </button>
          <button
            onClick={release}
            disabled={loading || busy}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {busy ? "Bezig..." : "Deze keer vrijgeven"}
          </button>
        </div>
      ) : (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 mb-2">
            Kies een vrij moment voor {bandName} in plaats van {shortDate(date)}:
          </p>
          {options.length === 0 ? (
            <p className="text-sm text-gray-600">Geen vrije dagdelen in de komende weken.</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {options.map((o) => {
                const chosen = choice?.date === o.date && choice.dagdeelId === o.dagdeelId;
                return (
                  <button
                    key={`${o.date}-${o.dagdeelId}`}
                    onClick={() => setChoice(o)}
                    aria-pressed={chosen}
                    className={`px-3 py-1.5 border rounded-lg text-sm ${
                      chosen ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-300 hover:bg-blue-100"
                    }`}
                  >
                    {shortDate(o.date)} {o.label}
                  </button>
                );
              })}
            </div>
          )}
          {choice && (
            <button
              onClick={() => submit(choice.date, choice.dagdeelId)}
              disabled={busy}
              className="mt-3 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              {busy
                ? "Bezig..."
                : `Bevestigen: ${shortDate(date)} wordt ${shortDate(choice.date)} ${choice.label.toLowerCase()}`}
            </button>
          )}
          <button
            onClick={() => {
              setOptions(null);
              setChoice(null);
            }}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            Annuleren
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
