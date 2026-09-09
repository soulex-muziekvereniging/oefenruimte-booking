"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { config } from "@/config";

type Booking = {
  id: string;
  band_name: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  price_cents: number;
  status: "pending" | "confirmed";
  cancel_token: string;
};

type Subscription = {
  id: string;
  band_name: string;
  weekday: number;
  dagdeel_id: string;
  frequency: "weekly" | "biweekly";
  price_cents: number;
  status: "pending_first_payment" | "active";
  cancel_token: string;
};

const DAY_NAMES_NL = [
  "Zondag",
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
];

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatWeekdayDagdeel(subscription: Subscription): string {
  const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);
  return `${DAY_NAMES_NL[subscription.weekday]} ${dagdeel?.label ?? subscription.dagdeel_id}`;
}

function OverzichtContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Deze link is ongeldig.");
      return;
    }

    fetch(`/api/mijn-boekingen/overzicht?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Er ging iets mis bij het ophalen van je boekingen");
          return;
        }
        setBookings(data.bookings);
        setSubscriptions(data.subscriptions);
      })
      .catch(() => setError("Er ging iets mis bij het ophalen van je boekingen"));
  }, [token]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold mb-2">Kan boekingen niet tonen</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/mijn-boekingen"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Nieuwe link aanvragen
          </a>
        </div>
      </div>
    );
  }

  if (!bookings || !subscriptions) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">
        Laden...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-16 space-y-6">
      <h2 className="text-2xl font-bold">Mijn boekingen</h2>

      <div>
        <h3 className="font-semibold text-gray-700 mb-2">Vaste reservering</h3>
        {subscriptions.length === 0 ? (
          <p className="text-gray-500 text-sm">Geen vaste reservering.</p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((s) => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="font-medium">{s.band_name}</p>
                <p className="text-sm text-gray-600">
                  Elke {formatWeekdayDagdeel(s)} ·{" "}
                  {config.subscriptionPricing[s.frequency].label} ·{" "}
                  {formatPrice(s.price_cents)}/mnd
                </p>
                <p className="text-sm text-gray-500 mb-3">
                  {s.status === "active" ? "Actief" : "Wacht op eerste betaling"}
                </p>
                {s.status === "active" && (
                  <a
                    href={`/subscription/cancel?id=${s.id}&token=${s.cancel_token}`}
                    className="inline-block px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium"
                  >
                    Opzeggen
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-gray-700 mb-2">Losse boekingen</h3>
        {bookings.length === 0 ? (
          <p className="text-gray-500 text-sm">Geen losse boekingen.</p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="font-medium">{b.band_name}</p>
                <p className="text-sm text-gray-600">
                  {formatDate(b.slot_date)}, {formatTime(b.slot_start_time)} –{" "}
                  {formatTime(b.slot_end_time)} · {formatPrice(b.price_cents)}
                </p>
                <p className="text-sm text-gray-500 mb-3">
                  {b.status === "confirmed" ? "Bevestigd" : "In afwachting"}
                </p>
                {b.status === "confirmed" && (
                  <a
                    href={`/booking/cancel?id=${b.id}&token=${b.cancel_token}`}
                    className="inline-block px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium"
                  >
                    Annuleren
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OverzichtPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">
          Laden...
        </div>
      }
    >
      <OverzichtContent />
    </Suspense>
  );
}
