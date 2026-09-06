"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function CancelContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("id");
  const cancelToken = searchParams.get("token");
  const [status, setStatus] = useState<
    "confirm" | "cancelling" | "done" | "error"
  >("confirm");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleCancel() {
    if (!bookingId || !cancelToken) return;
    setStatus("cancelling");

    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelToken }),
    });

    if (!res.ok) {
      const data = await res.json();
      setErrorMsg(data.error || "Er ging iets mis bij het annuleren");
      setStatus("error");
      return;
    }

    setStatus("done");
  }

  if (!bookingId || !cancelToken) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold mb-2">Ongeldige link</h2>
          <p className="text-gray-600">
            Deze annuleringslink is ongeldig of verlopen.
          </p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl mb-4">🔄</div>
          <h2 className="text-2xl font-bold mb-2">Boeking geannuleerd</h2>
          <p className="text-gray-600 mb-6">
            Je boeking is geannuleerd en de refund wordt verwerkt. Dit kan
            enkele werkdagen duren.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Terug naar overzicht
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold mb-2">Boeking annuleren</h2>
        <p className="text-gray-600 mb-6">
          Weet je zeker dat je deze boeking wilt annuleren? Het betaalde bedrag
          wordt teruggestort.
        </p>

        {status === "error" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            {errorMsg}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <a
            href="/"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Nee, terug
          </a>
          <button
            onClick={handleCancel}
            disabled={status === "cancelling"}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {status === "cancelling" ? "Annuleren..." : "Ja, annuleer boeking"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">
          Laden...
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
