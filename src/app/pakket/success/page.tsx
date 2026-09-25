"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PaymentResult from "../../PaymentResult";

function SuccessContent() {
  const searchParams = useSearchParams();
  const packageId = searchParams.get("id");

  return (
    <PaymentResult
      statusUrl={packageId ? `/api/packages/${encodeURIComponent(packageId)}/status` : null}
      successStatuses={["paid"]}
      pendingStatuses={["pending"]}
      retryHref="/"
      success={<Confirmed packageId={packageId} />}
    />
  );
}

function Confirmed({ packageId }: { packageId: string | null }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold mb-2">Pakket bevestigd!</h2>
        <p className="text-gray-600 mb-6">
          Je betaling is ontvangen en alle data zijn voor jullie vastgelegd. Je ontvangt een
          bevestigingsmail met de data en per datum een annuleringslink. Voordat het pakket
          afloopt, krijg je vanzelf een mail om te verlengen.
        </p>
        {packageId && (
          <p className="text-xs text-gray-400 mb-6">Pakketnummer: {packageId}</p>
        )}
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

export default function PackageSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">Laden...</div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
