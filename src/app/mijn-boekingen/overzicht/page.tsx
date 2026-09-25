"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { config } from "@/config";
import { hoursUntilSlot } from "@/lib/date";

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

type SubscriptionPeriod = {
  period_month: string;
  amount_cents: number;
  due_date: string;
  grace_until: string;
  status: "unpaid" | "paid" | "waived";
  pay_token: string;
};

type Occurrence = {
  date: string;
  swappedTo: { date: string; dagdeelId: string } | null;
};

type Subscription = {
  id: string;
  band_name: string;
  weekday: number;
  dagdeel_id: string;
  frequency: "weekly";
  price_cents: number;
  status: "pending_first_payment" | "active" | "lapsed";
  cancel_token: string;
  currentPeriod: SubscriptionPeriod | null;
  occurrences: Occurrence[];
  swapsUsed: number;
  swapsAllowed: number;
};

type SwapOption = {
  date: string;
  dagdeelId: string;
  dagdeelLabel: string;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dagdeelLabelFor(dagdeelId: string): string {
  return config.dagdelen.find((d) => d.id === dagdeelId)?.label ?? dagdeelId;
}

// Zelfde grens als de server: schuiven kan tot cancellationCutoffHours voor aanvang.
function canStillSwap(date: string, dagdeelId: string): boolean {
  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId);
  if (!dagdeel) return false;
  const start = `${dagdeel.startHour.toString().padStart(2, "0")}:00:00`;
  return hoursUntilSlot(date, start) >= config.cancellationCutoffHours;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

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

function formatMonth(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
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
  const [bandName, setBandName] = useState<string | null>(null);
  const [bandMembers, setBandMembers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [addEmailError, setAddEmailError] = useState("");
  const [swapPanelFor, setSwapPanelFor] = useState<{ subscriptionId: string; date: string } | null>(
    null
  );
  const [swapOptions, setSwapOptions] = useState<SwapOption[] | null>(null);
  const [swapOptionsLoading, setSwapOptionsLoading] = useState(false);
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapError, setSwapError] = useState("");

  function loadOverzicht() {
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
        setBandName(data.bandName);
        setBandMembers(data.bandMembers ?? []);
      })
      .catch(() => setError("Er ging iets mis bij het ophalen van je boekingen"));
  }

  useEffect(loadOverzicht, [token]);

  async function handleAddBandMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingEmail(true);
    setAddEmailError("");

    const res = await fetch("/api/mijn-boekingen/bandleden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newEmail }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAddEmailError(data.error || "Kon e-mailadres niet toevoegen");
      setAddingEmail(false);
      return;
    }

    setNewEmail("");
    setAddingEmail(false);
    loadOverzicht();
  }

  async function openSwapPanel(subscriptionId: string, date: string) {
    setSwapPanelFor({ subscriptionId, date });
    setSwapOptions(null);
    setSwapError("");
    setSwapOptionsLoading(true);

    const weekStart = getWeekStart(new Date(date + "T00:00:00"));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const periodMonth = date.slice(0, 7);

    const res = await fetch(
      `/api/slots?from=${toLocalDateStr(weekStart)}&to=${toLocalDateStr(weekEnd)}`
    );
    const data = await res.json();

    const options: SwapOption[] = [];
    if (res.ok) {
      for (const day of data as {
        date: string;
        slots: { dagdeelId: string; startTime: string; available: boolean }[];
      }[]) {
        if (day.date.slice(0, 7) !== periodMonth) continue;
        for (const slot of day.slots) {
          if (slot.available && hoursUntilSlot(day.date, slot.startTime) >= config.cancellationCutoffHours) {
            options.push({ date: day.date, dagdeelId: slot.dagdeelId, dagdeelLabel: dagdeelLabelFor(slot.dagdeelId) });
          }
        }
      }
    }

    setSwapOptions(options);
    setSwapOptionsLoading(false);
  }

  async function handleSwapSubmit(subscriptionId: string, originalDate: string, newDate: string, newDagdeelId: string) {
    setSwapSubmitting(true);
    setSwapError("");

    const res = await fetch(`/api/mijn-boekingen/subscriptions/${subscriptionId}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, originalDate, newDate, newDagdeelId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSwapError(data.error || "Kon niet verplaatsen");
      setSwapSubmitting(false);
      return;
    }

    setSwapSubmitting(false);
    setSwapPanelFor(null);
    loadOverzicht();
  }

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
                <p className="text-sm text-gray-500 mb-2">
                  {s.status === "active"
                    ? "Actief"
                    : s.status === "lapsed"
                      ? "Vervallen (niet op tijd betaald)"
                      : "Wacht op eerste betaling"}
                </p>

                {s.status === "active" && s.currentPeriod && (
                  <div className="mb-3">
                    {s.currentPeriod.status === "paid" ? (
                      <p className="text-sm text-green-700">
                        Periode {formatMonth(s.currentPeriod.period_month)} betaald.
                      </p>
                    ) : s.currentPeriod.status === "waived" ? (
                      <p className="text-sm text-blue-700">
                        Periode {formatMonth(s.currentPeriod.period_month)}: kwijtgescholden, tijdslot blijft van jullie.
                      </p>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800 mb-2">
                          Betaal vóór {new Date(s.currentPeriod.due_date + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}{" "}
                          om het tijdslot te behouden ({formatPrice(s.currentPeriod.amount_cents)}).
                        </p>
                        <a
                          href={`/vaste-reservering/betalen?token=${s.currentPeriod.pay_token}`}
                          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                        >
                          Periode betalen
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {s.status === "active" && s.occurrences.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Repetities deze periode ({s.swapsUsed}/{s.swapsAllowed} keer geschoven)
                    </p>
                    <ul className="space-y-1.5">
                      {s.occurrences.map((occ) => (
                        <li
                          key={occ.date}
                          className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2"
                        >
                          <span>
                            {occ.swappedTo ? (
                              <>
                                <span className="line-through text-gray-400">
                                  {formatShortDate(occ.date)}
                                </span>{" "}
                                → {formatShortDate(occ.swappedTo.date)} (
                                {dagdeelLabelFor(occ.swappedTo.dagdeelId)})
                              </>
                            ) : (
                              formatShortDate(occ.date)
                            )}
                          </span>
                          {!occ.swappedTo &&
                            s.swapsUsed < s.swapsAllowed &&
                            canStillSwap(occ.date, s.dagdeel_id) && (
                            <button
                              onClick={() => openSwapPanel(s.id, occ.date)}
                              className="text-blue-600 hover:text-blue-700 text-xs font-medium shrink-0"
                            >
                              Kan niet →
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {swapPanelFor?.subscriptionId === s.id && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-900 mb-2">
                          Kies een ander moment in dezelfde week als{" "}
                          {formatShortDate(swapPanelFor.date)}. Je ruilt in, je betaalt niets
                          extra.
                        </p>
                        {swapOptionsLoading ? (
                          <p className="text-sm text-gray-500">Laden...</p>
                        ) : swapOptions && swapOptions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {swapOptions.map((opt) => (
                              <button
                                key={`${opt.date}-${opt.dagdeelId}`}
                                onClick={() =>
                                  handleSwapSubmit(s.id, swapPanelFor.date, opt.date, opt.dagdeelId)
                                }
                                disabled={swapSubmitting}
                                className="px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-100 disabled:opacity-50"
                              >
                                {formatShortDate(opt.date)} {opt.dagdeelLabel}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">
                            Geen vrije dagdelen deze week binnen deze periode.
                          </p>
                        )}
                        {swapError && (
                          <p className="text-sm text-red-600 mt-2">{swapError}</p>
                        )}
                        <button
                          onClick={() => setSwapPanelFor(null)}
                          className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                        >
                          Annuleren
                        </button>
                      </div>
                    )}
                  </div>
                )}

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
                {b.status === "confirmed" &&
                  (hoursUntilSlot(b.slot_date, b.slot_start_time) >=
                  config.cancellationCutoffHours ? (
                    <a
                      href={`/booking/cancel?id=${b.id}&token=${b.cancel_token}`}
                      className="inline-block px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium"
                    >
                      Annuleren
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Annuleren kan niet meer (uiterlijk {config.cancellationCutoffHours} uur
                      van tevoren)
                    </p>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {bandName && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-2">Bandleden - {bandName}</h3>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-3">
              Deze e-mailadressen kunnen namens {bandName} boeken en beheren:
            </p>
            <ul className="space-y-1 mb-4">
              {bandMembers.map((m) => (
                <li key={m} className="text-sm text-gray-700">
                  {m}
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddBandMember} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="E-mailadres van bandlid"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <button
                type="submit"
                disabled={addingEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shrink-0"
              >
                {addingEmail ? "Toevoegen..." : "Toevoegen"}
              </button>
            </form>
            {addEmailError && (
              <p className="text-sm text-red-600 mt-2">{addEmailError}</p>
            )}
          </div>
        </div>
      )}
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
