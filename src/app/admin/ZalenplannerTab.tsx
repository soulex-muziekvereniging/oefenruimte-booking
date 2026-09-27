"use client";

import { useEffect, useState } from "react";

type WorkItem = {
  key: string;
  status: "nieuw" | "gewijzigd" | "verwijderen";
  description: string;
  previous?: string;
};

const STATUS_STYLE: Record<WorkItem["status"], { label: string; className: string }> = {
  nieuw: { label: "Nieuw - erin zetten", className: "bg-green-100 text-green-800" },
  gewijzigd: { label: "Gewijzigd - aanpassen", className: "bg-amber-100 text-amber-800" },
  verwijderen: { label: "Vervallen - eruit halen", className: "bg-red-100 text-red-700" },
};

const BORGH_PLANNER_URL = "https://deborghbudel.nl/mrbs/Default.aspx";

// Werklijst voor het handmatig overnemen van reserveringen in de zalenplanner van De Borgh.
// Na het verwerken klik je op "Verwerkt"; het item komt pas terug als er iets verandert.
export default function ZalenplannerTab() {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/zalenplanner");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Kon de werklijst niet laden");
      setItems([]);
      return;
    }
    setError("");
    setItems(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function mark(body: object, busyKey: string) {
    setBusy(busyKey);
    const res = await fetch("/api/admin/zalenplanner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Opslaan is niet gelukt");
      return;
    }
    setItems(data);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold">Zalenplanner De Borgh</h2>
        <a
          href={BORGH_PLANNER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
        >
          Open zalenplanner De Borgh ↗
        </a>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Wat nog in de zalenplanner van De Borgh (ruimte 0.37 Pop-oefenruimte) gezet, aangepast
        of verwijderd moet worden. Klaar met een regel? Klik op <strong>Verwerkt</strong>; hij
        komt pas terug als er iets aan verandert. Vaste reserveringen staan er één keer in als
        reeks.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          ✅ Alles staat in de zalenplanner - niets te doen.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${STATUS_STYLE[item.status].className}`}
                  >
                    {STATUS_STYLE[item.status].label}
                  </span>
                  <p className="text-sm">{item.description}</p>
                  {item.previous && (
                    <p className="text-xs text-gray-500 line-through">{item.previous}</p>
                  )}
                </div>
                <button
                  onClick={() => mark({ keys: [item.key] }, item.key)}
                  disabled={busy !== null}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {busy === item.key ? "Bezig..." : "Verwerkt ✓"}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              if (
                confirm(
                  `Alle ${items.length} regels als verwerkt markeren? Doe dit alleen als alles al in de zalenplanner van De Borgh staat (bijvoorbeeld de eerste keer).`
                )
              ) {
                mark({ all: true }, "all");
              }
            }}
            disabled={busy !== null}
            className="mt-4 text-sm text-gray-600 underline hover:text-gray-800 disabled:opacity-50"
          >
            Alles als verwerkt markeren
          </button>
        </>
      )}
    </div>
  );
}
