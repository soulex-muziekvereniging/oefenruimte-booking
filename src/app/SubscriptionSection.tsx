"use client";

import { useState, useEffect } from "react";
import { config } from "@/config";
import { toLocalDateStr } from "@/lib/date";
import MembershipRequestPrompt from "./MembershipRequestPrompt";

type Frequency = keyof typeof config.subscriptionPricing;

type Availability = {
  available: boolean;
  message?: string;
  firstDates?: string[];
};

function euro(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

const inputClass =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base";

export default function SubscriptionSection({
  initialFrequency = "weekly",
}: {
  initialFrequency?: Frequency;
}) {
  const today = toLocalDateStr(new Date());
  const maxStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() + config.maxWeeksAhead * 7);
    return toLocalDateStr(d);
  })();

  const [frequency, setFrequency] = useState<Frequency>(initialFrequency);
  const [startDate, setStartDate] = useState("");
  const [dagdeelId, setDagdeelId] = useState<string>(config.dagdelen[0].id);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [storage, setStorage] = useState(false);
  const [storageFree, setStorageFree] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notAMember, setNotAMember] = useState(false);

  useEffect(() => {
    fetch("/api/storage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStorageFree(data ? data.free : 0))
      .catch(() => setStorageFree(0));
  }, []);

  useEffect(() => {
    if (!startDate) return;
    let cancelled = false;
    const qs = new URLSearchParams({ startDate, dagdeelId, frequency });
    fetch(`/api/subscriptions/availability?${qs}`)
      .then((res) => res.json())
      .then((data: Availability) => !cancelled && setAvailability(data))
      .catch(
        () =>
          !cancelled &&
          setAvailability({ available: false, message: "Kon beschikbaarheid niet controleren" })
      );
    return () => {
      cancelled = true;
      setAvailability(null);
    };
  }, [startDate, dagdeelId, frequency]);

  const pricing = config.subscriptionPricing[frequency];
  const totalCents = pricing.priceCentsPerPeriod + (storage ? config.storage.priceCentsPerPeriod : 0);

  async function handleEmailBlur(email: string) {
    if (!email || !email.includes("@")) return;
    const res = await fetch(`/api/members/check?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setNotAMember(!data.isMember);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!availability?.available) return;

    setSubmitting(true);
    setError("");
    setNotAMember(false);

    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, startDate, dagdeelId, frequency, storage }),
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

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">Vaste reservering</h2>
      <p className="text-sm text-gray-600 mb-2">
        Claim hetzelfde dagdeel, elke week of om de week. Je betaalt per {config.periodWeeks}{" "}
        weken ({euro(pricing.priceCentsPerPeriod / pricing.sessionsPerPeriod)} per keer) via een
        betaallink per e-mail; er wordt niets automatisch afgeschreven.
      </p>
      <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-0.5">
        <li>Het tijdslot blijft van jullie zolang je betaalt - nooit hoeven verlengen</li>
        <li>
          Kan een keer niet? {config.subscriptionMaxSwapsPerPeriod}× per {config.periodWeeks} weken
          gratis verplaatsen naar een ander moment
        </li>
      </ul>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(config.subscriptionPricing) as Frequency[]).map((key) => (
            <label
              key={key}
              className={`flex flex-col border rounded-lg px-3 py-2.5 cursor-pointer text-sm ${
                frequency === key ? "border-blue-500 bg-blue-50" : "border-gray-300"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="frequency"
                  checked={frequency === key}
                  onChange={() => setFrequency(key)}
                />
                {config.subscriptionPricing[key].label}
              </span>
              <span className="text-gray-600 pl-6">
                {euro(config.subscriptionPricing[key].priceCentsPerPeriod)} per{" "}
                {config.periodWeeks} weken
              </span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Eerste keer</label>
            <input
              type="date"
              required
              min={today}
              max={maxStart}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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

        {startDate && !availability && (
          <p className="text-sm text-gray-500">Beschikbaarheid controleren...</p>
        )}
        {availability && !availability.available && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            {availability.message}
          </div>
        )}
        {availability?.available && availability.firstDates && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
            Beschikbaar! De eerste keren:{" "}
            {availability.firstDates.map(formatDate).join(", ")}, ...
          </div>
        )}

        {storageFree === null ? null : storageFree > 0 ? (
          <label className="flex items-start gap-2 border border-gray-300 rounded-lg px-3 py-2.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={storage}
              onChange={(e) => setStorage(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Opslagruimte erbij</span> ·{" "}
              {euro(config.storage.priceCentsPerPeriod)} per {config.periodWeeks} weken
              <span className="block text-gray-500">
                Om je spullen te laten staan. Nog {storageFree} van{" "}
                {config.storage.units.length} vrij - vol is vol.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-gray-500">
            Opslagruimte bijhuren: op dit moment zijn alle {config.storage.units.length}{" "}
            opslagruimtes verhuurd.
          </p>
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
          disabled={submitting || !availability?.available}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
        >
          {submitting
            ? "Even geduld..."
            : `Aanvragen en eerste ${config.periodWeeks} weken betalen (${euro(totalCents)}) →`}
        </button>
      </form>
    </div>
  );
}
