"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

type WorkItem = {
  key: string;
  status: "nieuw" | "gewijzigd" | "verwijderen";
  description: string;
  previous?: string;
  addUrl?: string;
  addNote?: string;
  mailLine?: string;
};

type Snapshot = { items: WorkItem[]; borghEmail: string; weekUrl: string };

// Wat moet Kimberly (of een andere beheerder) met een regel doen?
function actionLabel(item: WorkItem): { label: string; className: string } {
  if (item.addUrl && item.mailLine)
    return { label: "Aanpassen", className: "bg-amber-100 text-amber-800" };
  if (item.addUrl) return { label: "Toevoegen", className: "bg-green-100 text-green-800" };
  return { label: "Doorgeven aan De Borgh", className: "bg-red-100 text-red-700" };
}

function mailBody(lines: string[]): string {
  return [
    "Beste medewerker van De Borgh,",
    "",
    "Willen jullie in de zalenplanner bij ruimte 0.37 (Pop-oefenruimte) het volgende aanpassen?",
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    "Alvast bedankt!",
    "",
    "Met vriendelijke groet,",
    config.organizationName,
  ].join("\r\n");
}

function mailtoLink(to: string, lines: string[]): string {
  const subject = "Zalenplanner ruimte 0.37: graag aanpassen";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody(lines))}`;
}

// Werklijst voor het handmatig overnemen van reserveringen in de zalenplanner van De Borgh.
// Toevoegen doe je zelf (knop opent hun formulier met datum en tijd al ingevuld);
// verwijderen gaat via een mail aan De Borgh. Daarna op "Verwerkt" klikken.
export default function ZalenplannerTab() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function apply(data: Snapshot) {
    setSnap(data);
    setEmailInput(data.borghEmail);
  }

  useEffect(() => {
    fetch("/api/admin/zalenplanner")
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "Kon de werklijst niet laden");
          setSnap({ items: [], borghEmail: "", weekUrl: "" });
          return;
        }
        setSnap(data);
        setEmailInput(data.borghEmail);
      });
  }, []);

  async function post(body: object, busyKey: string) {
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
    setError("");
    apply(data);
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Kopiëren lukte niet; selecteer de tekst en kopieer hem zelf.");
    }
  }

  const items = snap?.items ?? [];
  const mailLines = items.filter((i) => i.mailLine).map((i) => i.mailLine!);
  const borghEmail = snap?.borghEmail ?? "";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold">Zalenplanner De Borgh</h2>
        {snap?.weekUrl && (
          <a
            href={snap.weekUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Open zalenplanner (ruimte 0.37) ↗
          </a>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        De Borgh wil weten wanneer er iemand in de oefenruimte is (niet wie). Hieronder staat
        wat daarvoor nog in hun zalenplanner moet of eruit moet. Klaar met een regel? Klik op{" "}
        <strong>Verwerkt</strong>; hij komt pas terug als er iets aan verandert.
      </p>

      <details className="mb-4 bg-white rounded-lg border border-gray-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Hoe werkt het?</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
          <li>
            <strong>Toevoegen</strong>: de knop opent het formulier van De Borgh in een nieuw
            venster, met datum, begintijd en ruimte al ingevuld. Log daar de eerste keer in en
            vink <em>Onthoud mij</em> aan, dan hoeft dat daarna niet meer op deze computer.
          </li>
          <li>
            Als naam vul je steeds{" "}
            <button
              type="button"
              onClick={() => copy(config.roomName, "name")}
              className="font-mono bg-gray-100 px-1.5 py-0.5 rounded hover:bg-gray-200"
              title="Kopiëren"
            >
              {config.roomName}
            </button>{" "}
            {copied === "name" ? "(gekopieerd)" : "in (klik om te kopiëren)"}. Eindtijd: 4 uur na
            de begintijd. Bij een reeks ook het herhalen instellen.
          </li>
          <li>
            <strong>Doorgeven aan De Borgh</strong>: verwijderen kan alleen De Borgh zelf. De
            mailknop zet alles in één kant-en-klare mail; jij verstuurt hem.
          </li>
        </ul>
      </details>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          post({ borghEmail: emailInput }, "email");
        }}
        className="mb-4 flex flex-col sm:flex-row sm:items-end gap-2 text-sm"
      >
        <label className="flex-1">
          <span className="block font-medium text-gray-700 mb-1">
            Mailadres van De Borgh (voor verwijderverzoeken)
          </span>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="bijv. info@deborghbudel.nl"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>
        <button
          type="submit"
          disabled={busy !== null || emailInput.trim() === borghEmail}
          className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "email" ? "Opslaan..." : "Opslaan"}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {mailLines.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <p className="font-medium text-red-800 mb-2">
            Door te geven aan De Borgh ({mailLines.length})
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={mailtoLink(borghEmail, mailLines)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              ✉ Alles in één mail
            </a>
            <button
              type="button"
              onClick={() => copy(mailBody(mailLines), "all")}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {copied === "all" ? "Gekopieerd ✓" : "Kopieer tekst"}
            </button>
          </div>
          {!borghEmail && (
            <p className="text-xs text-gray-600 mt-2">
              Nog geen mailadres ingevuld; dat vul je dan zelf in de mail in.
            </p>
          )}
        </div>
      )}

      {snap === null ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          ✅ Alles staat in de zalenplanner - niets te doen.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const action = actionLabel(item);
              return (
                <li
                  key={item.key}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${action.className}`}
                    >
                      {action.label}
                    </span>
                    <p className="text-sm">{item.description}</p>
                    {item.previous && (
                      <p className="text-xs text-gray-500 line-through">{item.previous}</p>
                    )}
                    {item.addNote && <p className="text-xs text-gray-600">{item.addNote}</p>}
                    {item.mailLine && (
                      <p className="text-xs text-red-700">Aan De Borgh: {item.mailLine}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {item.addUrl && (
                      <a
                        href={item.addUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                      >
                        Invullen bij De Borgh ↗
                      </a>
                    )}
                    {item.mailLine && (
                      <a
                        href={mailtoLink(borghEmail, [item.mailLine])}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                      >
                        ✉ Mail
                      </a>
                    )}
                    <button
                      onClick={() => post({ keys: [item.key] }, item.key)}
                      disabled={busy !== null}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy === item.key ? "Bezig..." : "Verwerkt ✓"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => {
              if (
                confirm(
                  `Alle ${items.length} regels als verwerkt markeren? Doe dit alleen als de zalenplanner van De Borgh al klopt (bijvoorbeeld de eerste keer).`
                )
              ) {
                post({ all: true }, "all");
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
