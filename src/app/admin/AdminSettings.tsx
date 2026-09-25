"use client";

import { useEffect, useState } from "react";

type Recipient = { id: string; email: string };
type AdminUser = { id: string; email: string; hasPassword: boolean; isMe: boolean };

// Tab "Instellingen": wie de meldingen krijgt en wie er beheerder is. Allebei zonder
// code-aanpassing of deploy te wijzigen.
export default function AdminSettings() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [r, a] = await Promise.all([
      fetch("/api/admin/notification-recipients"),
      fetch("/api/admin/admin-users"),
    ]);
    if (r.status === 401 || a.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const rData = await r.json().catch(() => ({}));
    const aData = await a.json().catch(() => ({}));
    setLoadError(!r.ok ? rData.error || "Kon meldingen niet laden" : !a.ok ? aData.error || "Kon beheerders niet laden" : "");
    if (r.ok) setRecipients(rData);
    if (a.ok) setAdmins(aData);
  }

  useEffect(() => {
    load();
  }, []);

  async function call(url: string, method: "POST" | "DELETE", body?: object) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Er ging iets mis");
      setBusy(false);
      return false;
    }
    await load();
    setBusy(false);
    return true;
  }

  const inputClass =
    "flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const addButton =
    "px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm shrink-0";
  const removeButton =
    "text-xs text-red-600 hover:text-red-700 disabled:opacity-50 shrink-0";

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {loadError}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
        <h2 className="text-lg font-bold mb-1">Meldingen</h2>
        <p className="text-sm text-gray-600 mb-4">
          Deze adressen krijgen een mail bij elke nieuwe boeking, pakket of vaste reservering,
          bij opzeggingen en verplaatsingen, bij lidmaatschapsverzoeken en als er actie nodig
          is. Bands krijgen hun eigen bevestigingen los hiervan.
        </p>
        <ul className="divide-y divide-gray-100 mb-4">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate">{r.email}</span>
              <button
                disabled={busy || recipients.length <= 1}
                title={recipients.length <= 1 ? "Er moet minstens één adres overblijven" : undefined}
                onClick={() => {
                  if (confirm(`${r.email} krijgt dan geen meldingen meer. Doorgaan?`)) {
                    call(`/api/admin/notification-recipients/${r.id}`, "DELETE");
                  }
                }}
                className={removeButton}
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("/api/admin/notification-recipients", "POST", { email: newRecipient })) {
              setNewRecipient("");
            }
          }}
        >
          <input
            type="email"
            required
            placeholder="naam@voorbeeld.nl"
            value={newRecipient}
            onChange={(e) => setNewRecipient(e.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={busy} className={addButton}>
            Toevoegen
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
        <h2 className="text-lg font-bold mb-1">Beheerders</h2>
        <p className="text-sm text-gray-600 mb-4">
          Wie kan inloggen op dit beheerpaneel. Een nieuwe beheerder stelt zelf een wachtwoord
          in via &quot;Wachtwoord vergeten&quot; op de inlogpagina; de link komt in de eigen
          mailbox.
        </p>
        <ul className="divide-y divide-gray-100 mb-4">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">
                  {a.email}
                  {a.isMe && <span className="text-gray-400"> (jij)</span>}
                </span>
                {!a.hasPassword && (
                  <span className="block text-xs text-amber-700">
                    Nog geen wachtwoord ingesteld
                  </span>
                )}
              </span>
              {!a.isMe && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`${a.email} kan dan niet meer inloggen op het beheerpaneel. Doorgaan?`)) {
                      call(`/api/admin/admin-users/${a.id}`, "DELETE");
                    }
                  }}
                  className={removeButton}
                >
                  Verwijderen
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("/api/admin/admin-users", "POST", { email: newAdmin })) {
              setNewAdmin("");
            }
          }}
        >
          <input
            type="email"
            required
            placeholder="naam@soulex.nl"
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={busy} className={addButton}>
            Toevoegen
          </button>
        </form>
      </section>
    </div>
  );
}
