"use client";

import { useState, useEffect, useRef } from "react";
import { config } from "@/config";
import { toLocalDateStr } from "@/lib/date";
import SubscriptionSection from "./SubscriptionSection";
import MembershipRequestPrompt from "./MembershipRequestPrompt";
import JoinRequestForm from "./JoinRequestForm";

type Slot = {
  date: string;
  dagdeelLabel: string;
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
  dagdeelLabel: string;
  startTime: string;
  endTime: string;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const formatDateStr = toLocalDateStr;

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
  const [mode, setMode] = useState<"once" | "subscription" | "join" | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notAMember, setNotAMember] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const weekEndStr = (() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return formatDateStr(d);
  })();

  const weekStartStr = formatDateStr(weekStart);

  const today = new Date();
  const canGoPrev = weekStart > getWeekStart(today);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 4 * 7);
  const canGoNext = new Date(weekEndStr + "T00:00:00") < maxDate;

  const maxDateStr = formatDateStr(maxDate);
  // De datepicker toont altijd de maandag van de weergegeven week, dus min moet
  // de maandag van deze week zijn - todayStr zou op elke dag na maandag al vóór
  // de weergegeven waarde liggen en de input ongeldig maken.
  const earliestWeekStartStr = formatDateStr(getWeekStart(today));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      const res = await fetch(`/api/slots?from=${weekStartStr}&to=${weekEndStr}`);
      const data = await res.json();
      if (!cancelled) {
        if (!res.ok) {
          setLoadError(data.error || "Kon beschikbare tijdslots niet ophalen");
          setDays([]);
        } else {
          setDays(data);
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [weekStartStr, weekEndStr]);

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

  function handleDatePick(dateStr: string) {
    if (!dateStr) return;
    const picked = new Date(dateStr + "T00:00:00");
    const newWeekStart = getWeekStart(picked);
    const earliest = getWeekStart(today);
    if (newWeekStart < earliest) {
      setWeekStart(earliest);
    } else {
      setWeekStart(newWeekStart);
    }
  }

  async function handleEmailBlur(email: string) {
    if (!email || !email.includes("@")) return;
    const res = await fetch(`/api/members/check?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setNotAMember(!data.isMember);
  }

  function handleSlotClick(slot: Slot) {
    if (!slot.available) return;
    if (
      selectedSlot?.date === slot.date &&
      selectedSlot?.startTime === slot.startTime
    ) {
      setSelectedSlot(null);
      return;
    }
    setSelectedSlot({
      date: slot.date,
      dagdeelLabel: slot.dagdeelLabel,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setSubmitting(true);
    setError("");
    setNotAMember(false);

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
      setNotAMember(res.status === 403);
      setSubmitting(false);
      return;
    }

    window.location.href = data.checkoutUrl;
  }

  const cheapestSubscriptionCents = Math.min(
    ...Object.values(config.subscriptionPricing).map((p) => p.priceCentsPerMonth)
  );

  if (mode === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          Boek {config.roomName.toLowerCase()}
        </h2>
        <p className="text-gray-600 mb-10 max-w-xl mx-auto">
          Reserveer een dagdeel (Ochtend, Middag of Avond, telkens 4 uur) voor je
          band, of vraag een vaste wekelijkse of tweewekelijkse reservering aan.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
          <button
            onClick={() => setMode("once")}
            className="text-left bg-white border-2 border-gray-200 rounded-xl p-5 sm:p-6 hover:border-blue-400 hover:shadow-md transition-all"
          >
            <span className="block text-lg font-semibold mb-1">
              Eenmalige boeking
            </span>
            <span className="block text-sm text-gray-600 mb-3">
              Los dagdeel op een datum naar keuze
            </span>
            <span className="block text-xl font-bold text-blue-600">
              €{(config.pricePerSlotCents / 100).toFixed(2).replace(".", ",")}
            </span>
          </button>
          <button
            onClick={() => setMode("subscription")}
            className="text-left bg-white border-2 border-gray-200 rounded-xl p-5 sm:p-6 hover:border-blue-400 hover:shadow-md transition-all"
          >
            <span className="block text-lg font-semibold mb-1">
              Vaste reservering
            </span>
            <span className="block text-sm text-gray-600 mb-3">
              Elke week of elke twee weken hetzelfde dagdeel
            </span>
            <span className="block text-xl font-bold text-blue-600">
              vanaf €{(cheapestSubscriptionCents / 100).toFixed(2).replace(".", ",")}/mnd
            </span>
          </button>
        </div>
        <button
          onClick={() => setMode("join")}
          className="mt-6 text-sm text-blue-600 hover:text-blue-700"
        >
          Nog geen lid? Vraag hier toegang aan →
        </button>
      </div>
    );
  }

  if (mode === "join") {
    return <JoinRequestForm onBack={() => setMode(null)} />;
  }

  if (mode === "subscription") {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <button
          onClick={() => setMode(null)}
          className="text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Andere optie kiezen
        </button>
        <SubscriptionSection />
      </div>
    );
  }

  return (
    <div className={`max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 ${selectedSlot ? "pb-[420px] sm:pb-[400px]" : ""}`}>
      <button
        onClick={() => setMode(null)}
        className="text-sm text-blue-600 hover:text-blue-700 mb-4"
      >
        ← Andere optie kiezen
      </button>
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-6">
        <button
          onClick={handlePrevWeek}
          disabled={!canGoPrev}
          className="min-w-[44px] min-h-[44px] px-2 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          <span className="sm:hidden">&larr;</span>
          <span className="hidden sm:inline">&larr; Vorige week</span>
        </button>
        <h2 className="text-sm sm:text-lg font-semibold text-center min-w-0">
          {formatDisplayDate(weekStartStr)} –{" "}
          {formatDisplayDate(weekEndStr)}
        </h2>
        <button
          onClick={handleNextWeek}
          disabled={!canGoNext}
          className="min-w-[44px] min-h-[44px] px-2 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          <span className="sm:hidden">&rarr;</span>
          <span className="hidden sm:inline">Volgende week &rarr;</span>
        </button>
      </div>

      {/* Date picker to jump to a specific week */}
      <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
        <label htmlFor="datepicker" className="text-sm text-gray-600">
          Ga naar datum:
        </label>
        <input
          ref={dateInputRef}
          id="datepicker"
          type="date"
          min={earliestWeekStartStr}
          max={maxDateStr}
          value={weekStartStr}
          onChange={(e) => handleDatePick(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Laden...</div>
      ) : loadError ? (
        <div className="text-center py-12 text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {loadError}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
          {days.map((day) => {
            const isPast = day.date < formatDateStr(new Date());
            return (
              <div
                key={day.date}
                className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3"
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
                        onClick={() => handleSlotClick(slot)}
                        disabled={disabled}
                        className={`w-full text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded transition-colors min-h-[40px] ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : !slot.available
                              ? "bg-red-50 text-red-700 border border-red-200 cursor-not-allowed"
                              : disabled
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 active:bg-green-200 cursor-pointer"
                        }`}
                      >
                        <span className="block font-medium">{slot.dagdeelLabel}</span>
                        <span className="block text-[10px] sm:text-xs opacity-75">
                          {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
                        </span>
                        {!slot.available && (
                          <span className="block text-[10px] sm:text-xs opacity-75">
                            Bezet
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Docked booking panel at bottom of screen */}
      {selectedSlot && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] z-50">
          <div className="max-h-[75vh] overflow-y-auto overscroll-contain">
            <div className="max-w-lg mx-auto p-4 sm:p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Boeking maken</h3>
                  <p className="text-sm text-gray-600">
                    {selectedSlot.dagdeelLabel} · {formatFullDate(selectedSlot.date)},{" "}
                    {selectedSlot.startTime.slice(0, 5)} –{" "}
                    {selectedSlot.endTime.slice(0, 5)}
                    {" · "}
                    <span className="font-medium">
                      €{(config.pricePerSlotCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                  aria-label="Sluiten"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
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
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                      placeholder="Je naam"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mailadres *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.contactEmail}
                      onChange={(e) => {
                        setFormData({ ...formData, contactEmail: e.target.value });
                        setNotAMember(false);
                      }}
                      onBlur={(e) => handleEmailBlur(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
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
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                      placeholder="06-12345678"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {notAMember && (
                  <MembershipRequestPrompt
                    bandName={formData.bandName}
                    contactName={formData.contactName}
                    contactEmail={formData.contactEmail}
                    contactPhone={formData.contactPhone}
                  />
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
                >
                  {submitting ? "Even geduld..." : "Betalen en boeken →"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
