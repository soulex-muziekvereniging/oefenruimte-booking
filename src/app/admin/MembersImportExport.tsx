"use client";

import { useRef, useState } from "react";
import { membersToCsv, parseMembersCsv, readCsvFile, type MemberCsvRow } from "@/lib/memberCsv";

type Member = { name: string; email: string; phone: string | null; active: boolean };
type ResultRow = { line: number; email: string; name: string; action: string; detail: string };
type Result = {
  dryRun: boolean;
  summary: { toevoegen: number; bijwerken: number; ongewijzigd: number; overslaan: number; fout: number };
  rows: ResultRow[];
};

const ACTION_STYLE: Record<string, string> = {
  toevoegen: "bg-green-100 text-green-800",
  bijwerken: "bg-blue-100 text-blue-800",
  ongewijzigd: "bg-gray-100 text-gray-600",
  overslaan: "bg-amber-100 text-amber-800",
  fout: "bg-red-100 text-red-700",
};

// Knoppen "Exporteren" en "Importeren" bij de ledenlijst. Importeren toont eerst een
// voorbeeld; pas na "Bevestigen" wordt er iets opgeslagen.
export default function MembersImportExport({
  members,
  onImported,
}: {
  members: Member[];
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MemberCsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([membersToCsv(members)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledenlijst-soulex-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function send(data: MemberCsvRow[], dryRun: boolean): Promise<Result | null> {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/members/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: data, dryRun }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Importeren is niet gelukt");
      return null;
    }
    return body as Result;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDone("");
    setResult(null);
    const parsed = parseMembersCsv(await readCsvFile(file));
    setFileName(file.name);
    setRows(parsed);
    if (parsed.length === 0) {
      setError("Geen regels gevonden in dit bestand.");
      return;
    }
    setResult(await send(parsed, true));
  }

  async function confirmImport() {
    if (!rows) return;
    const r = await send(rows, false);
    if (!r) return;
    setDone(
      `Klaar: ${r.summary.toevoegen} toegevoegd, ${r.summary.bijwerken} bijgewerkt` +
        (r.summary.fout ? `, ${r.summary.fout} regels met een fout overgeslagen` : "") +
        "."
    );
    close();
    onImported();
  }

  function close() {
    setRows(null);
    setResult(null);
    setFileName("");
  }

  const toApply = result ? result.summary.toevoegen + result.summary.bijwerken : 0;

  return (
    <>
      <button
        onClick={exportCsv}
        disabled={members.length === 0}
        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
      >
        Exporteren
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
      >
        Importeren
      </button>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" onChange={onFile} className="hidden" />

      {done && (
        <div className="basis-full p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {done}
        </div>
      )}
      {error && !result && (
        <div className="basis-full p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {result && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold">Ledenlijst importeren</h3>
              <p className="text-sm text-gray-600 mt-1">
                Voorbeeld van <strong>{fileName}</strong> ({rows?.length} regels). Er is nog niets
                opgeslagen.
              </p>
              <div className="flex flex-wrap gap-2 mt-3 text-xs">
                {Object.entries(result.summary).map(([k, v]) => (
                  <span key={k} className={`px-2 py-1 rounded-full font-medium ${ACTION_STYLE[k]}`}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="pb-2 pr-2 font-medium">Regel</th>
                    <th className="pb-2 pr-2 font-medium">Band / e-mail</th>
                    <th className="pb-2 font-medium">Wat gebeurt er</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.rows.map((r) => (
                    <tr key={`${r.line}-${r.email}`}>
                      <td className="py-1.5 pr-2 text-gray-500 tabular-nums">{r.line}</td>
                      <td className="py-1.5 pr-2">
                        <span className="block font-medium">{r.name || "-"}</span>
                        <span className="block text-xs text-gray-500">{r.email || "-"}</span>
                      </td>
                      <td className="py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLE[r.action]}`}>
                          {r.action}
                        </span>
                        {r.detail && <span className="block text-xs text-gray-600 mt-0.5">{r.detail}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-5 border-t border-gray-200 flex flex-wrap items-center justify-end gap-2">
              {error && <p className="text-sm text-red-700 mr-auto">{error}</p>}
              <p className="text-xs text-gray-500 mr-auto">
                Er wordt nooit iemand verwijderd. Regels met een fout worden overgeslagen.
              </p>
              <button onClick={close} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Annuleren
              </button>
              <button
                onClick={confirmImport}
                disabled={busy || toApply === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Bezig..." : toApply === 0 ? "Niets te importeren" : `Bevestigen (${toApply})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
