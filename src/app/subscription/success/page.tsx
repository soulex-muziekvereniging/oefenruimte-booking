"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PaymentResult from "../../PaymentResult";

function SuccessContent() {
  const searchParams = useSearchParams();
  const subscriptionId = searchParams.get("id");

  return (
    <PaymentResult
      statusUrl={
        subscriptionId ? `/api/subscriptions/${encodeURIComponent(subscriptionId)}/status` : null
      }
      successStatuses={["active"]}
      pendingStatuses={["pending_first_payment"]}
      retryHref="/"
      success={<Confirmed subscriptionId={subscriptionId} />}
    />
  );
}

function Confirmed({ subscriptionId }: { subscriptionId: string | null }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold mb-2">Vaste reservering bevestigd!</h2>
        <p className="text-gray-600 mb-6">
          Je eerste betaling is ontvangen en het tijdslot is van jullie. Je ontvangt
          een bevestigingsmail met alle details en een opzeglink. Elke maand krijg je
          hiervoor een apart betaalverzoek per e-mail - er wordt niets automatisch
          afgeschreven.
        </p>
        {subscriptionId && (
          <p className="text-xs text-gray-400 mb-6">
            Reserveringsnummer: {subscriptionId}
          </p>
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

export default function SubscriptionSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-500">
          Laden...
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
