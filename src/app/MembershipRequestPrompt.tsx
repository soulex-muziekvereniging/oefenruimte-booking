"use client";

import { useState } from "react";

type Props = {
  bandName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

export default function MembershipRequestPrompt({
  bandName,
  contactName,
  contactEmail,
  contactPhone,
}: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleRequest() {
    setStatus("sending");
    const res = await fetch("/api/membership-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandName, contactName, contactEmail, contactPhone }),
    });
    setStatus(res.ok ? "sent" : "error");
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-green-700">
        Verzoek verstuurd! Het bestuur neemt het in behandeling en neemt contact met je op.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 mb-1">
        Nog geen lid? Dien met deze gegevens een verzoek in.
      </p>
      <button
        type="button"
        onClick={handleRequest}
        disabled={status === "sending"}
        className="px-3 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 text-sm font-medium"
      >
        {status === "sending" ? "Versturen..." : "Verzoek indienen om lid te worden"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-600 mt-1">
          Kon het verzoek niet versturen, probeer het later opnieuw.
        </p>
      )}
    </div>
  );
}
