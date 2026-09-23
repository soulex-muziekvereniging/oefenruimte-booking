"use client";

import { useState } from "react";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/admin/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setLoading(false);
      return;
    }

    setMessage(data.message);
    setLoading(false);
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-2 text-center">Wachtwoord instellen</h2>
        <p className="text-sm text-gray-500 mb-4 text-center">
          Vul je beheerders-e-mailadres in. Je krijgt een link om een (nieuw) wachtwoord in te
          stellen.
        </p>
        {message ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              placeholder="beheer@soulex.nl"
            />
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
              {loading ? "Bezig..." : "Verstuur link"}
            </button>
          </form>
        )}
        <p className="text-center text-sm mt-4">
          <a href="/admin/login" className="text-blue-600 hover:text-blue-700">
            Terug naar inloggen
          </a>
        </p>
      </div>
    </div>
  );
}
