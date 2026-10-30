"use client";

import { useEffect, useState } from "react";

type MailLogEntry = {
  at: string;
  kind: "rekening" | "herinnering" | "waarschuwing" | "vervallen";
  band: string;
  period: string | null;
  to: string[];
  ok: boolean;
  error?: string;
};

type MailLog = {
  lastRun: { at: string; skipped?: string; sent: number; failed: number } | null;
  entries: MailLogEntry[];
};

const KIND_LABEL: Record<MailLogEntry["kind"], string> = {
  rekening: "Rekening",
  herinnering: "Herinnering",
  waarschuwing: "Laatste waarschuwing",
  vervallen: "Vaste plek vervallen",
};

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortPeriod(period: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  const [from, to] = period.split(" t/m ");
  return to ? `${fmt(from)} t/m ${fmt(to)}` : period;
}

// Bovenaan de tab Betalingen: heeft de dagelijkse controle gedraaid, en zijn de mails aan de
// bands (rekeningen, herinneringen, waarschuwingen) verstuurd? Met per mail de adressen.
// unsentCount: rekeningen in het overzicht die nog niet verstuurd konden worden.
export default function MailLogPanel({ unsentCount }: { unsentCount: number }) {
  const [log, setLog] = useState<MailLog | null>(null);

  useEffect(() => {
    fetch("/api/admin/mail-log")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setLog(data ?? { lastRun: null, entries: [] }))
      .catch(() => setLog({ lastRun: null, entries: [] }));
  }, []);

  if (!log) return null;
  const run = log.lastRun;
  const bad = (run && run.failed > 0) || unsentCount > 0;

  return (
    <section
      className={`rounded-lg border p-3 sm:p-4 mb-4 text-sm ${
        bad ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
      }`}
    >
      <h3 className="font-semibold text-gray-900 mb-1">Mails aan de bands</h3>
      <p className="text-gray-700">
        {!run ? (
          <>Nog geen controle gedraaid. De site controleert elke ochtend rond 7:00 of er rekeningen of herinneringen weg moeten.</>
        ) : run.skipped ? (
          <>
            Laatste controle: <strong>{dateTime(run.at)}</strong>. Er is niets verstuurd, want de
            rekeningen staan uit (Instellingen &gt; Rekeningen vaste plek).
          </>
        ) : (
          <>
            Laatste controle: <strong>{dateTime(run.at)}</strong>.{" "}
            {run.sent === 0 && run.failed === 0 ? (
              "Er hoefde niets verstuurd te worden."
            ) : (
              <>
                <strong className="text-green-800">{run.sent} verstuurd</strong>
                {run.failed > 0 && (
                  <>
                    , <strong className="text-red-700">{run.failed} mislukt</strong>
                  </>
                )}
                .
              </>
            )}
          </>
        )}
      </p>
      {unsentCount > 0 && (
        <p className="text-red-700 mt-1">
          {unsentCount === 1 ? "1 rekening is" : `${unsentCount} rekeningen zijn`} nog niet bij de
          band aangekomen. De site probeert het elke ochtend opnieuw; kijk hieronder wat er mis
          ging (vaak een fout e-mailadres bij Leden).
        </p>
      )}

      {log.entries.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-blue-700 hover:underline">
            Verstuurde mails bekijken ({log.entries.length})
          </summary>
          <ul className="mt-2 divide-y divide-gray-100 bg-white rounded border border-gray-200">
            {log.entries.map((e, i) => (
              <li key={`${e.at}-${i}`} className="px-3 py-2">
                <p>
                  <span className={e.ok ? "text-green-700" : "text-red-700"}>{e.ok ? "✓" : "✗"}</span>{" "}
                  <strong>{e.band}</strong> · {KIND_LABEL[e.kind]}
                  {e.period ? ` ${shortPeriod(e.period)}` : ""}
                  <span className="text-gray-500"> · {dateTime(e.at)}</span>
                </p>
                <p className="text-xs text-gray-500 break-all">Aan: {e.to.join(", ")}</p>
                {e.error && <p className="text-xs text-red-700">Fout: {e.error}</p>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            ✓ betekent dat de mailserver hem heeft aangenomen. Komt een mail terug omdat een adres
            niet (meer) bestaat, dan zie je dat in het Resend-dashboard.
          </p>
        </details>
      )}
    </section>
  );
}
