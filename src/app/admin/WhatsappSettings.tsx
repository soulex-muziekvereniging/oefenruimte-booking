"use client";

import { useEffect, useState } from "react";
import {
  fillTemplate,
  WHATSAPP_PLACEHOLDERS,
  type WhatsappTemplates,
} from "@/lib/whatsappTemplates";

const EXAMPLE = { naam: "Kimberly", band: "Linders Park", datum: "dinsdag 6 oktober", dagdeel: "avond" };

// De teksten die de WhatsApp-knoppen in het beheerpaneel alvast invullen.
export default function WhatsappSettings({ onSaved }: { onSaved?: (t: WhatsappTemplates) => void }) {
  const [form, setForm] = useState<WhatsappTemplates | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/whatsapp-templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setForm(data));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/whatsapp-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Opslaan is niet gelukt" });
      return;
    }
    setForm(data);
    onSaved?.(data);
    setMessage({ ok: true, text: "Opgeslagen." });
  }

  const fields: { key: keyof WhatsappTemplates; label: string; hint: string }[] = [
    {
      key: "repetition",
      label: "Bericht over een repetitie",
      hint: "Knop in het kalendervenster (tik op een blok bij Boekingen).",
    },
    {
      key: "general",
      label: "Algemeen bericht",
      hint: "Knoppen in de ledenlijst en bij de vaste reserveringen.",
    },
  ];

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <h2 className="text-lg font-bold mb-1">WhatsApp-berichten</h2>
      <p className="text-sm text-gray-600 mb-4">
        De tekst die alvast klaarstaat als je op een WhatsApp-knop drukt; je kunt hem in WhatsApp
        nog aanvullen voordat je verstuurt. Invulvelden: {WHATSAPP_PLACEHOLDERS.join(" ")}. Leeg
        laten = standaardtekst.
      </p>

      {!form ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {fields.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="block font-medium text-gray-700">{f.label}</span>
              <span className="block text-xs text-gray-500 mb-1">{f.hint}</span>
              <textarea
                rows={2}
                maxLength={500}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="block text-xs text-gray-500 mt-1">
                Voorbeeld: <em>{fillTemplate(form[f.key], EXAMPLE)}</em>
              </span>
            </label>
          ))}

          {message && (
            <div
              className={`p-3 rounded-lg text-sm border ${
                message.ok
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {busy ? "Opslaan..." : "Berichten opslaan"}
          </button>
        </form>
      )}
    </section>
  );
}
