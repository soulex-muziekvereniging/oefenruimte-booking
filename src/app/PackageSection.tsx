"use client";

import { useState, useEffect } from "react";
import { config } from "@/config";
import { toLocalDateStr, hoursUntilSlot } from "@/lib/date";
import MembershipRequestPrompt from "./MembershipRequestPrompt";

type DaySlots = {
  date: string;
  slots: { dagdeelId: string; startTime: string; available: boolean }[];
};

const { sessions, intervalWeeks, priceCents } = config.packagePricing;

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

export default function PackageSection() {
  const today = toLocalDateStr(new Date());
  const maxFirst = addDays(today, config.maxWeeksAhead * 7);

  const [firstDate, setFirstDate] = useState("");
  const [dagdeelId, setDagdeelId] = useState<string>(config.dagdelen[0].id);
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notAMember, setNotAMember] = useState(false);

  const dates = firstDate
    ? Array.from({ length: sessions }, (_, i) => addDays(firstDate, i * intervalWeeks * 7))
    : [];
  const dagdeel = config.dagdelen.find((d) => d.id === dagdeelId)!;
  const startTime = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;

  useEffect(() => {
    if (!firstDate) return;
    let cancelled = false;
    const last = addDays(firstDate, (sessions - 1) * intervalWeeks * 7);
    fetch(`/api/slots?from=${firstDate}&to=${last}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((days: DaySlots[]) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        for (const day of days) {
          const slot = day.slots.find((s) => s.dagdeelId === dagdeelId);
          map[day.date] = !!slot?.available;
        }
        setAvailability(map);
      })
      .catch(() => !cancelled && setAvailability({}));
    return () => {
      cancelled = true;
      setAvailability(null);
    };
  }, [firstDate, dagdeelId]);

  const firstStarted = firstDate ? hoursUntilSlot(firstDate, startTime) <= 0 : false;
  const takenDates = availability ? dates.filter((d) => availability[d] === false) : [];
  const allFree = !!availability && !firstStarted && takenDates.length === 0 && dates.length > 0;

  async function handleEmailBlur(email: string) {
    if (!email || !email.includes("@")) return;
    const res = await fetch(`/api/members/check?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setNotAMember(!data.isMember);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allFree) return;
    setSubmitting(true);
    setError("");
    setNotAMember(false);

    const res = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, firstDate, dagdeelId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(
        data.unavailableDates?.length
          ? `${data.error}: ${data.unavailableDates.map(formatDate).join(", ")}`
          : data.error || "Er ging iets mis"
      );
      setNotAMember(res.status === 403);
      setSubmitting(false);
      return;
    }

    window.location.href = data.checkoutUrl;
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base";

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">
        {config.packagePricing.label} · {formatPrice(priceCents)}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        {sessions}× hetzelfde dagdeel, om de {intervalWeeks} weken, in één keer betaald (
        {formatPrice(priceCents / sessions)} per keer). Voordat het pakket afloopt krijg je een
        mail om te verlengen - wie op tijd verlengt, houdt hetzelfde tijdslot.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Eerste keer</label>
            <input
              type="date"
              required
              min={today}
              max={maxFirst}
              value={firstDate}
              onChange={(e) => setFirstDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dagdeel</label>
            <select
              value={dagdeelId}
              onChange={(e) => setDagdeelId(e.target.value)}
              className={inputClass}
            >
              {config.dagdelen.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {dates.length > 0 && (
          <ul className="space-y-1.5">
            {dates.map((d, i) => {
              const taken = availability?.[d] === false || (i === 0 && firstStarted);
              return (
                <li
                  key={d}
                  className={`text-sm rounded-lg px-3 py-2 ${
                    !availability
                      ? "bg-gray-50 text-gray-500"
                      : taken
                        ? "bg-red-50 text-red-700"
                        : "bg-green-50 text-green-800"
                  }`}
                >
                  {formatDate(d)} · {dagdeel.label}
                  {availability && (taken ? " - bezet" : " - vrij")}
                </li>
              );
            })}
          </ul>
        )}

        {availability && !allFree && dates.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            Niet alle data zijn vrij. Kies een andere eerste datum of een ander dagdeel.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bandnaam *</label>
            <input
              type="text"
              required
              value={formData.bandName}
              onChange={(e) => setFormData({ ...formData, bandName: e.target.value })}
              className={inputClass}
              placeholder="Naam van je band"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon *</label>
            <input
              type="text"
              required
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className={inputClass}
              placeholder="Je naam"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres *</label>
            <input
              type="email"
              required
              value={formData.contactEmail}
              onChange={(e) => {
                setFormData({ ...formData, contactEmail: e.target.value });
                setNotAMember(false);
              }}
              onBlur={(e) => handleEmailBlur(e.target.value)}
              className={inputClass}
              placeholder="band@voorbeeld.nl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefoonnummer</label>
            <input
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              className={inputClass}
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
          disabled={submitting || !allFree}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
        >
          {submitting ? "Even geduld..." : `Pakket betalen - ${formatPrice(priceCents)} →`}
        </button>
      </form>
    </div>
  );
}
