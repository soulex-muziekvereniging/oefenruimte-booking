"use client";

import { useState, useEffect, useCallback } from "react";

type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
};

type DaySlots = {
  date: string;
  dayLabel: string;
  slots: Slot[];
};

type SelectedSlot = {
  date: string;
  startTime: string;
  endTime: string;
  dayLabel: string;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Home() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const today = new Date();
  const canGoPrev = weekStart > getWeekStart(today);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 4 * 7);
  const canGoNext = weekEnd < maxDate;

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const from = formatDateStr(weekStart);
    const to = formatDateStr(weekEnd);
    const res = await fetch(`/api/slots?from=${from}&to=${to}`);
    const data = await res.json();
    setDays(data);
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  function handlePrevWeek() {
    if (!canGoPrev) return;
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function handleNextWeek() {
    if (!canGoNext) return;
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  function handleSlotClick(slot: Slot, dayLabel: string) {
    if (!slot.available) return;
    setSelectedSlot({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      dayLabel,
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bandName: formData.bandName,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        slotDate: selectedSlot.date,
        slotStartTime: selectedSlot.startTime,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setSubmitting(false);
      return;
    }

    window.location.href = data.checkoutUrl;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePrevWeek}
          disabled={!canGoPrev}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Vorige week
        </button>
        <h2 className="text-lg font-semibold text-center">
          {formatDisplayDate(formatDateStr(weekStart))} –{" "}
          {formatDisplayDate(formatDateStr(weekEnd))}
        </h2>
        <button
          onClick={handleNextWeek}
          disabled={!canGoNext}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Volgende week →
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Laden...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {days.map((day) => {
            const isPast = day.date < formatDateStr(new Date());
            return (
              <div
                key={day.date}
                className="bg-white rounded-lg border border-gray-200 p-3"
              >
                <div className="text-sm font-semibold text-gray-700 mb-2 text-center">
                  {day.dayLabel}
                  <br />
                  <span className="text-xs text-gray-500">
                    {new Date(day.date + "T00:00:00").toLocaleDateString(
                      "nl-NL",
                      { day: "numeric", month: "short" }
                    )}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {day.slots.map((slot) => {
                    const disabled = !slot.available || isPast;
                    const isSelected =
                      selectedSlot?.date === slot.date &&
                      selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={`${slot.date}-${slot.startTime}`}
                        onClick={() => handleSlotClick(slot, day.dayLabel)}
                        disabled={disabled}
                        className={`w-full text-xs py-1.5 px-2 rounded transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : disabled
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 cursor-pointer"
                        }`}
                      >
                        {slot.startTime.slice(0, 5)} –{" "}
                        {slot.endTime.slice(0, 5)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSlot && (
        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6 max-w-lg mx-auto">
          <h3 className="text-lg font-semibold mb-1">Boeking maken</h3>
          <p className="text-sm text-gray-600 mb-4">
            {selectedSlot.dayLabel} {formatFullDate(selectedSlot.date)},{" "}
            {selectedSlot.startTime.slice(0, 5)} –{" "}
            {selectedSlot.endTime.slice(0, 5)}
            {" · "}
            <span className="font-medium">€20,00</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bandnaam *
              </label>
              <input
                type="text"
                required
                value={formData.bandName}
                onChange={(e) =>
                  setFormData({ ...formData, bandName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Naam van je band"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contactpersoon *
              </label>
              <input
                type="text"
                required
                value={formData.contactName}
                onChange={(e) =>
                  setFormData({ ...formData, contactName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Je naam"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mailadres *
              </label>
              <input
                type="email"
                required
                value={formData.contactEmail}
                onChange={(e) =>
                  setFormData({ ...formData, contactEmail: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="band@voorbeeld.nl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefoonnummer
              </label>
              <input
                type="tel"
                value={formData.contactPhone}
                onChange={(e) =>
                  setFormData({ ...formData, contactPhone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="06-12345678"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Even geduld..." : "Betalen en boeken →"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
