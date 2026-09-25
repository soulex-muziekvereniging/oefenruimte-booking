"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

type PeriodInfo = {
  status: "unpaid" | "paid" | "waived" | "processing";
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  graceUntil: string;
  bandName: string;
  rhythm: string;
  subscriptionStatus: string;
};

function formatPeriod(start: string, end: string): string {
  const short = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${short(start)} t/m ${short(end)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function BetalenContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [info, setInfo] = useState<PeriodInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Deze link is ongeldig.");
      return;
    }
    let cancelled = false;
    let polls = 0;

    function load() {
      polls += 1;
      fetch(`/api/subscriptions/payments/${encodeURIComponent(token!)}`)
        .then(async (res) => {
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setLoadError(data.error || "Kon deze betaalperiode niet vinden");
            return;
          }
          setInfo(data);
          // Net terug van Mollie: de webhook kan een paar seconden later binnenkomen.
          if (data.status === "processing" && polls < 15) setTimeout(load, 2000);
        })
        .catch(() => !cancelled && setLoadError("Kon deze betaalperiode niet vinden"));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handlePay() {
    setPaying(true);
    setError("");
    const res = await fetch(`/api/subscriptions/payments/${encodeURIComponent(token!)}/pay`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setPaying(false);
      return;
    }
    window.location.href = data.checkoutUrl;
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold mb-2">Kan deze periode niet tonen</h2>
          <p className="text-gray-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">Laden...</div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h2 className="text-xl font-bold mb-1">
          {info.bandName} - {formatPeriod(info.periodStart, info.periodEnd)}
        </h2>
        <p className="text-gray-600 mb-6">
          {info.rhythm.charAt(0).toUpperCase() + info.rhythm.slice(1)}
        </p>

        {info.status === "paid" ? (
          <p className="text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
            Deze periode is al betaald. Bedankt!
          </p>
        ) : info.status === "waived" ? (
          <p className="text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-4">
            Voor deze periode hoeft niet betaald te worden - het tijdslot blijft gewoon van
            jullie.
          </p>
        ) : info.status === "processing" ? (
          <p className="text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-4">
            Je betaling wordt verwerkt. Dit duurt meestal maar even - je krijgt een
            bevestigingsmail zodra hij binnen is.
          </p>
        ) : info.subscriptionStatus !== "active" ? (
          <p className="text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
            Deze vaste reservering is niet meer actief.
          </p>
        ) : (
          <>
            <p className="text-gray-700 mb-1">
              Te betalen: <span className="font-semibold">{formatPrice(info.amountCents)}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {new Date(info.dueDate + "T00:00:00") < new Date(new Date().toDateString())
                ? `De betaaldatum (${formatDate(info.dueDate)}) is verstreken - betaal uiterlijk ${formatDate(info.graceUntil)} om het tijdslot te behouden.`
                : `Betaal vóór ${formatDate(info.dueDate)} om het tijdslot zonder gedoe te behouden (coulance tot en met ${formatDate(info.graceUntil)}).`}
            </p>

            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {paying ? "Even geduld..." : `Periode betalen — ${formatPrice(info.amountCents)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BetalenPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">Laden...</div>
      }
    >
      <BetalenContent />
    </Suspense>
  );
}
