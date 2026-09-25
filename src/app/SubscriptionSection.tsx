"use client";

import { useState, useEffect } from "react";
import { config } from "@/config";
import MembershipRequestPrompt from "./MembershipRequestPrompt";

const DAY_NAMES_NL = [
  "Zondag",
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
];

type Availability = {
  weekday: number;
  dagdeel_id: string;
};

export default function SubscriptionSection() {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [weekday, setWeekday] = useState<number>(config.operatingDays[0]);
  const [dagdeelId, setDagdeelId] = useState<string>(config.dagdelen[0].id);
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
    fetch("/api/subscriptions/availability")
      .then((res) => (res.ok ? res.json() : []))
      .then(setAvailability)
      .catch(() => setAvailability([]));
  }, []);

  const taken = availability.find(
    (a) => a.weekday === weekday && a.dagdeel_id === dagdeelId
  );

  async function handleEmailBlur(email: string) {
    if (!email || !email.includes("@")) return;
    const res = await fetch(`/api/members/check?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setNotAMember(!data.isMember);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (taken) return;

    setSubmitting(true);
    setError("");
    setNotAMember(false);

    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bandName: formData.bandName,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        weekday,
        dagdeelId,
        frequency: "weekly",
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

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">
        Vaste reservering · elke week · €
        {(config.subscriptionPricing.weekly.priceCentsPerMonth / 100).toFixed(2).replace(".", ",")}/mnd
      </h2>
      <p className="text-sm text-gray-600 mb-2">
        Claim structureel hetzelfde weekdag + dagdeel. Elke maand krijg je een betaalverzoek per
        e-mail, er wordt niets automatisch afgeschreven.
      </p>
      <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-0.5">
        <li>Het voordeligst per keer</li>
        <li>Het tijdslot blijft van jullie zolang je betaalt - nooit hoeven verlengen</li>
        <li>Kan een keer niet? {config.subscriptionMaxSwapsPerPeriod}× per maand gratis schuiven naar een ander moment</li>
      </ul>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weekdag
            </label>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            >
              {config.operatingDays.map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES_NL[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dagdeel
            </label>
            <select
              value={dagdeelId}
              onChange={(e) => setDagdeelId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            >
              {config.dagdelen.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {taken ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Dit weekdag + dagdeel is al vast gereserveerd door een andere band.
            Kies een andere combinatie.
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bandnaam *
            </label>
            <input
              type="text"
              required
              value={formData.bandName}
              onChange={(e) => setFormData({ ...formData, bandName: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
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
          disabled={submitting || !!taken}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
        >
          {submitting ? "Even geduld..." : "Aanvragen en eerste betaling starten →"}
        </button>
      </form>
    </div>
  );
}
