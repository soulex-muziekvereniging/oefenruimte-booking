"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

// Betaalpagina voor een losse boeking die het beheer heeft ingepland met betaalverzoek.
// Werkt zoals /vaste-reservering/betalen: de link uit de mail (&direct=1) stuurt meteen door
// naar iDEAL; terug van Mollie toont de pagina de status.

type BookingInfo = {
  status: "open" | "paid" | "waived" | "processing" | "cancelled";
  amountCents: number;
  bandName: string;
  date: string;
  startTime: string;
  endTime: string;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
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
  // Alleen de eerste keer meteen door naar iDEAL, niet bij terugkomst van Mollie (die
  // redirect heeft geen direct=1), anders ontstaat er een lus als iemand annuleert.
  const direct = searchParams.get("direct") === "1";
  const autoStarted = useRef(false);
  const [redirecting, setRedirecting] = useState(false);
  const [info, setInfo] = useState<BookingInfo | null>(null);
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
      fetch(`/api/bookings/pay/${encodeURIComponent(token!)}`)
        .then(async (res) => {
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setLoadError(data.error || "Kon deze boeking niet vinden");
            return;
          }
          setInfo(data);
          if (direct && !autoStarted.current && data.status === "open") {
            autoStarted.current = true;
            window.history.replaceState(null, "", `?token=${encodeURIComponent(token!)}`);
            setRedirecting(true);
            startPayment();
          }
          // Net terug van Mollie: de webhook kan een paar seconden later binnenkomen.
          if (data.status === "processing" && polls < 15) setTimeout(load, 2000);
        })
        .catch(() => !cancelled && setLoadError("Kon deze boeking niet vinden"));
    }

    load();
    return () => {
      cancelled = true;
    };
    // startPayment hoort hier bewust niet bij: die wordt alleen de eerste keer aangeroepen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, direct]);

  async function startPayment() {
    setPaying(true);
    setError("");
    const res = await fetch(`/api/bookings/pay/${encodeURIComponent(token!)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setPaying(false);
      setRedirecting(false);
      return;
    }
    window.location.href = data.checkoutUrl;
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold mb-2">Kan deze boeking niet tonen</h2>
          <p className="text-gray-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!info || redirecting) {
    return (
      <div className={`max-w-lg mx-auto px-4 py-16 text-center ${redirecting ? "text-ink" : "text-ink-muted"}`}>
        {redirecting ? "Je wordt doorgestuurd naar de betaalpagina..." : "Laden..."}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h2 className="text-xl font-bold mb-1">{info.bandName}</h2>
        <p className="text-gray-600 mb-6">
          {formatDate(info.date).replace(/^./, (c) => c.toUpperCase())}, {info.startTime} - {info.endTime}
        </p>

        {info.status === "paid" ? (
          <p className="text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
            Deze boeking is betaald. Bedankt!
          </p>
        ) : info.status === "waived" ? (
          <p className="text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-4">
            Voor deze boeking hoeft niet betaald te worden.
          </p>
        ) : info.status === "cancelled" ? (
          <p className="text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
            Deze boeking is geannuleerd.
          </p>
        ) : info.status === "processing" ? (
          <p className="text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-4">
            Je betaling wordt verwerkt. Dit duurt meestal maar even - je krijgt een
            bevestigingsmail zodra hij binnen is.
          </p>
        ) : (
          <>
            <p className="text-gray-700 mb-6">
              Te betalen: <span className="font-semibold">{formatPrice(info.amountCents)}</span>
            </p>
            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={startPayment}
              disabled={paying}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {paying ? "Even geduld..." : `Betalen — ${formatPrice(info.amountCents)}`}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Er kan maar één keer betaald worden. Heeft een ander bandlid al betaald, dan staat
              hier &quot;betaald&quot;.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function BoekingBetalenPage() {
  return (
    <Suspense
      fallback={<div className="max-w-lg mx-auto px-4 py-16 text-center text-ink-muted">Laden...</div>}
    >
      <BetalenContent />
    </Suspense>
  );
}
