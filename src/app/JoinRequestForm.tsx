"use client";

import { useState } from "react";

export default function JoinRequestForm({ onBack }: { onBack: () => void }) {
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    const res = await fetch("/api/membership-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 sm:py-20">
      <button
        onClick={onBack}
        className="text-sm text-blue-600 hover:text-blue-700 mb-4"
      >
        ← Andere optie kiezen
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8">
        {status === "sent" ? (
          <>
            <h2 className="text-xl font-bold mb-2">Verzoek verstuurd!</h2>
            <p className="text-gray-600">
              Het bestuur neemt je aanvraag in behandeling en neemt contact met je op.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-2">Lid worden</h2>
            <p className="text-gray-600 mb-6">
              Vul je gegevens in. Het bestuur beoordeelt je aanvraag en voegt je band toe
              aan de ledenlijst, waarna je kan boeken.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mailadres *
                </label>
                <input
                  type="email"
                  required
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
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

              {status === "error" && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  Kon het verzoek niet versturen, probeer het later opnieuw.
                </div>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-base"
              >
                {status === "sending" ? "Versturen..." : "Verzoek indienen"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
