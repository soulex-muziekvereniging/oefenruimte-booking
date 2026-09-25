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
  // Telefoonnummer is verplicht voor een lidmaatschapsverzoek, maar bij het boeken niet -
  // dus hier alsnog vragen als het nog leeg is.
  const [phone, setPhone] = useState(contactPhone);

  async function handleRequest() {
    setStatus("sending");
    const res = await fetch("/api/membership-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandName, contactName, contactEmail, contactPhone: phone }),
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
      {!contactPhone.trim() && (
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefoonnummer (verplicht)"
          className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      )}
      <button
        type="button"
        onClick={handleRequest}
        disabled={status === "sending" || !phone.trim()}
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
