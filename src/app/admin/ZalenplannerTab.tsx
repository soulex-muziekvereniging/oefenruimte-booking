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
  autoMail?: boolean;
  pendingSince?: string;
};

type BorghAuto = { enabled: boolean; delayHours: number };

type Snapshot = {
  items: WorkItem[];
  borghEmail: string;
  borghAuto: BorghAuto;
  lastAutoMail: { at: string; lines: string[] } | null;
  weekUrl: string;
};

const DELAY_OPTIONS = [1, 2, 3, 6, 12, 24];

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Wat moet Kimberly (of een andere beheerder) met een regel doen?
function actionLabel(item: WorkItem, auto: boolean): { label: string; className: string } {
  if (auto) return { label: "Gaat vanzelf naar De Borgh", className: "bg-blue-100 text-blue-800" };
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
          setSnap({
            items: [],
            borghEmail: "",
            borghAuto: { enabled: false, delayHours: 3 },
            lastAutoMail: null,
            weekUrl: "",
          });
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
  const borghEmail = snap?.borghEmail ?? "";
  const borghAuto = snap?.borghAuto ?? { enabled: false, delayHours: 3 };
  const autoOn = borghAuto.enabled && !!borghEmail;
  const isAuto = (i: WorkItem) => autoOn && !!i.autoMail;
  const mailLines = items.filter((i) => i.mailLine && !isAuto(i)).map((i) => i.mailLine!);

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

      <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={borghAuto.enabled}
            disabled={busy !== null}
            onChange={(e) =>
              post({ borghAuto: { ...borghAuto, enabled: e.target.checked } }, "auto")
            }
            className="mt-1"
          />
          <span>
            <span className="font-medium">Vrijgekomen tijden automatisch mailen naar De Borgh</span>
            <span className="block text-xs text-gray-600">
              Komt de ruimte vrij (een keer afgezegd, verplaatst of een reeks die stopt), dan
              gaat dat vanzelf naar De Borgh - zonder bandnamen, alles van dat moment in één
              mail. Verstuurd rond 7:00, 12:00 en 17:00 (in de winter een uur eerder). De
              meldingsontvangers krijgen een kopie; antwoorden komen bij{" "}
              {config.organizationEmail}.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 mt-2 ml-6">
          <span className="text-gray-700">Wachttijd na een annulering:</span>
          <select
            value={borghAuto.delayHours}
            disabled={busy !== null}
            onChange={(e) =>
              post({ borghAuto: { ...borghAuto, delayHours: Number(e.target.value) } }, "auto")
            }
            className="px-2 py-1 border border-gray-300 rounded-lg text-base"
          >
            {DELAY_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} uur
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Wordt een annulering binnen de wachttijd teruggedraaid of het dagdeel opnieuw
          geboekt, dan gaat er niets naar De Borgh.
        </p>
        {borghAuto.enabled && !borghEmail && (
          <p className="text-xs text-red-700 mt-2 ml-6">
            Vul hierboven eerst het mailadres van De Borgh in - tot die tijd wordt er niets
            verstuurd.
          </p>
        )}
        {snap?.lastAutoMail && (
          <details className="mt-2 ml-6 text-xs text-gray-600">
            <summary className="cursor-pointer">
              Laatste automatische mail: {timeLabel(snap.lastAutoMail.at)}
            </summary>
            <ul className="list-disc pl-5 mt-1">
              {snap.lastAutoMail.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

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
              const auto = isAuto(item);
              const action = actionLabel(item, auto);
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
                      <p className={`text-xs ${auto ? "text-blue-800" : "text-red-700"}`}>
                        Aan De Borgh: {item.mailLine}
                      </p>
                    )}
                    {auto && item.pendingSince && (
                      <p className="text-xs text-gray-500">
                        Wordt verstuurd bij de eerste verzendronde na{" "}
                        {timeLabel(
                          new Date(
                            Date.parse(item.pendingSince) + borghAuto.delayHours * 3_600_000
                          ).toISOString()
                        )}
                        . Niets meer aan doen.
                      </p>
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
                    {item.mailLine && !auto && (
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
