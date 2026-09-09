"use client";

import { useState } from "react";

export default function MijnBoekingenPage() {
  const [bandName, setBandName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const res = await fetch("/api/mijn-boekingen/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandName, email }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Er ging iets mis, probeer het later opnieuw");
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl mb-4">📬</div>
          <h2 className="text-2xl font-bold mb-2">Check je mail</h2>
          <p className="text-gray-600">
            Als deze bandnaam en dit e-mailadres bij elkaar horen, ontvang je zo een
            e-mail met een link naar je boekingen. Geen mail ontvangen? Controleer ook
            je spamfolder.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h2 className="text-2xl font-bold mb-2">Mijn boekingen</h2>
        <p className="text-gray-600 mb-6">
          Vul je bandnaam en e-mailadres in. Kloppen die met elkaar, dan sturen we je
          een tijdelijke link waarmee je je boekingen en vaste reservering kan
          bekijken en beheren.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bandnaam
            </label>
            <input
              type="text"
              required
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-mailadres
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-base"
          >
            {status === "sending" ? "Versturen..." : "Stuur mij een link"}
          </button>
        </form>
      </div>
    </div>
  );
}
