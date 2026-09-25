"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { config } from "@/config";

type RenewInfo = {
  bandName: string;
  dagdeelId: string;
  lastDate: string;
  renewBy: string;
  priceCents: number;
  dates: string[];
  unavailableDates: string[];
  alreadyRenewed: boolean;
  expired: boolean;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function RenewContent() {
  const token = useSearchParams().get("token");
  const [info, setInfo] = useState<RenewInfo | null>(null);
  const [loadError, setLoadError] = useState(token ? "" : "Deze link is ongeldig.");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/packages/renew/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setLoadError(data.error || "Kon het pakket niet laden.");
        else setInfo(data);
      })
      .catch(() => setLoadError("Kon het pakket niet laden."));
  }, [token]);

  async function handleRenew() {
    if (!token) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/packages/renew/${encodeURIComponent(token)}`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setSubmitting(false);
      return;
    }
    window.location.href = data.checkoutUrl;
  }

  if (loadError) {
    return <p className="text-center text-red-700">{loadError}</p>;
  }
  if (!info) {
    return <p className="text-center text-gray-500">Laden...</p>;
  }

  const dagdeel = config.dagdelen.find((d) => d.id === info.dagdeelId);
  const blocked = info.unavailableDates.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold mb-1">Pakket verlengen</h2>
      <p className="text-sm text-gray-600 mb-4">
        {info.bandName} · {dagdeel?.label ?? info.dagdeelId} · huidig pakket loopt tot en met{" "}
        {formatDate(info.lastDate)}
      </p>

      {info.alreadyRenewed ? (
        <p className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          Dit pakket is al verlengd. Je vindt de nieuwe data in je bevestigingsmail en bij
          &quot;Mijn boekingen&quot;.
        </p>
      ) : info.expired ? (
        <p className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          Verlengen kan niet meer. Boek gerust een nieuw pakket via de{" "}
          <a href="/" className="underline">homepage</a>.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700 mb-2">Het volgende pakket:</p>
          <ul className="space-y-1.5 mb-4">
            {info.dates.map((d) => {
              const taken = info.unavailableDates.includes(d);
              return (
                <li
                  key={d}
                  className={`text-sm rounded-lg px-3 py-2 ${
                    taken ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
                  }`}
                >
                  {formatDate(d)} {taken ? "- al bezet" : ""}
                </li>
              );
            })}
          </ul>
          {blocked ? (
            <p className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              Niet alle data zijn nog vrij, dus verlengen in hetzelfde ritme lukt niet. Kies een
              nieuw pakket op een ander moment via de <a href="/" className="underline">homepage</a>,
              of neem contact op via {config.organizationEmail}.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Verleng je vóór {formatDate(info.renewBy)}, dan zijn deze data gegarandeerd.
              </p>
              {error && (
                <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              <button
                onClick={handleRenew}
                disabled={submitting}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Even geduld..." : `Verlengen en betalen - ${formatPrice(info.priceCents)}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function RenewPackagePage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <Suspense fallback={<p className="text-center text-gray-500">Laden...</p>}>
        <RenewContent />
      </Suspense>
    </div>
  );
}
