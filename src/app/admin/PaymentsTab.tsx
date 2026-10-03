"use client";

import { useEffect, useState } from "react";

type PaymentRow = {
  id: string;
  kind: "periode" | "los";
  band: string;
  description: string;
  amountCents: number;
  status: "betaald" | "open" | "te laat" | "kwijtgescholden" | "geannuleerd";
  date: string;
  graceUntil: string | null;
  paidAt: string | null;
  paidBy: string | null;
};

type Filter = "alles" | "open" | "betaald";

const STATUS_STYLE: Record<PaymentRow["status"], string> = {
  betaald: "bg-green-100 text-green-800",
  open: "bg-amber-100 text-amber-800",
  "te laat": "bg-red-100 text-red-700",
  kwijtgescholden: "bg-gray-100 text-gray-700",
  geannuleerd: "bg-gray-100 text-gray-500",
};

const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

function shortDate(value: string): string {
  const d = value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "2-digit" });
}

// Tab "Betalingen": alle betalingen van het afgelopen jaar (vaste reserveringen per periode
// en losse boekingen), met bandnaam, status en wie er betaald heeft. Alleen inzien.
export default function PaymentsTab() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("alles");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/payments")
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "Kon de betalingen niet laden");
          setRows([]);
          return;
        }
        setRows(data);
      });
  }, []);

  const visible = (rows ?? []).filter((r) => {
    if (filter === "open" && r.status !== "open" && r.status !== "te laat") return false;
    if (filter === "betaald" && r.status !== "betaald") return false;
    return !search.trim() || r.band.toLowerCase().includes(search.trim().toLowerCase());
  });
  const paidTotal = visible.filter((r) => r.status === "betaald").reduce((s, r) => s + r.amountCents, 0);
  const openTotal = visible
    .filter((r) => r.status === "open" || r.status === "te laat")
    .reduce((s, r) => s + r.amountCents, 0);

  const filters: { key: Filter; label: string }[] = [
    { key: "alles", label: "Alles" },
    { key: "open", label: "Open" },
    { key: "betaald", label: "Betaald" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Betalingen</h2>
      <p className="text-sm text-gray-600 mb-4">
        Vaste reserveringen per periode en online betaalde losse boekingen, van het afgelopen
        jaar. Kwijtschelden of de vervaltermijn verlengen doe je bij Abonnementen.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              filter === f.key
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op band"
          className="ml-auto w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          Geen betalingen gevonden.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-700 mb-2">
            Betaald: <strong>{euro(paidTotal)}</strong>
            {openTotal > 0 && (
              <>
                {" "}
                · Nog open: <strong>{euro(openTotal)}</strong>
              </>
            )}{" "}
            <span className="text-gray-500">({visible.length} regels)</span>
          </p>

          {/* Tabel vanaf tablet, kaartjes op de telefoon */}
          <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Band</th>
                  <th className="px-3 py-2 font-medium">Waarvoor</th>
                  <th className="px-3 py-2 font-medium text-right">Bedrag</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Betaald door</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.band}</td>
                    <td className="px-3 py-2 text-gray-700">{r.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(r.amountCents)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                      {r.graceUntil && (
                        <span className="block text-xs text-gray-500 mt-0.5">
                          uiterlijk {shortDate(r.graceUntil)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.status === "betaald" ? (
                        <>
                          {r.paidBy ?? "onbekend"}
                          {r.paidAt && (
                            <span className="block text-xs text-gray-500">{shortDate(r.paidAt)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="sm:hidden space-y-2">
            {visible.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900">{r.band}</p>
                  <p className="tabular-nums font-medium">{euro(r.amountCents)}</p>
                </div>
                <p className="text-gray-700">{r.description}</p>
                <p className="mt-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>{" "}
                  <span className="text-xs text-gray-500">
                    {r.status === "betaald"
                      ? `door ${r.paidBy ?? "onbekend"}${r.paidAt ? ` op ${shortDate(r.paidAt)}` : ""}`
                      : r.graceUntil
                        ? `uiterlijk ${shortDate(r.graceUntil)}`
                        : ""}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
