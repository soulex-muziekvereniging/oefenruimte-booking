"use client";

import { useState } from "react";

type Booking = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  price_cents: number;
  status: string;
  created_at: string;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function fetchBookings(pw: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/bookings", {
      headers: { "x-admin-password": pw },
    });
    if (!res.ok) {
      setError("Ongeldig wachtwoord");
      setLoading(false);
      return false;
    }
    const data = await res.json();
    setBookings(data);
    setLoading(false);
    return true;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await fetchBookings(password);
    if (ok) setLoggedIn(true);
  }

  async function handleCancel(bookingId: string, bandName: string) {
    if (!confirm(`Weet je zeker dat je de boeking van "${bandName}" wilt annuleren? Het bedrag wordt teruggestort.`)) {
      return;
    }

    setCancelling(bookingId);
    const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het annuleren");
      setCancelling(null);
      return;
    }

    await fetchBookings(password);
    setCancelling(null);
  }

  if (!loggedIn) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold mb-4 text-center">Beheerder login</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wachtwoord
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                placeholder="Admin wachtwoord"
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-base"
            >
              {loading ? "Laden..." : "Inloggen"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Boekingen beheren</h2>
        <button
          onClick={() => fetchBookings(password)}
          disabled={loading}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {loading ? "Laden..." : "Vernieuwen"}
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          Geen aankomende boekingen gevonden.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg truncate">
                      {booking.band_name}
                    </h3>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        booking.status === "confirmed"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {booking.status === "confirmed" ? "Bevestigd" : "In afwachting"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(booking.slot_date)},{" "}
                    {formatTime(booking.slot_start_time)} –{" "}
                    {formatTime(booking.slot_end_time)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {booking.contact_name} · {booking.contact_email}
                    {booking.contact_phone ? ` · ${booking.contact_phone}` : ""}
                  </p>
                </div>

                {booking.status === "confirmed" && (
                  <button
                    onClick={() => handleCancel(booking.id, booking.band_name)}
                    disabled={cancelling === booking.id}
                    className="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium shrink-0 min-h-[44px] transition-colors"
                  >
                    {cancelling === booking.id ? "Annuleren..." : "Annuleer boeking"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
