"use client";

import { useState } from "react";
import { config } from "@/config";

type Booking = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  price_cents: number;
  status: string;
  created_at: string;
};

type Member = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

type Subscription = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  weekday: number;
  dagdeel_id: string;
  frequency: "weekly" | "biweekly";
  price_cents: number;
  status: "pending_first_payment" | "active" | "cancelled";
};

type MembershipRequest = {
  id: string;
  band_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const DAY_NAMES_NL = [
  "Zondag",
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
];

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

function formatWeekdayDagdeel(subscription: Subscription): string {
  const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);
  return `${DAY_NAMES_NL[subscription.weekday]} ${dagdeel?.label ?? subscription.dagdeel_id}`;
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<"bookings" | "members" | "subscriptions" | "requests">(
    "bookings"
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [togglingMember, setTogglingMember] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);
  const [newEmailByBand, setNewEmailByBand] = useState<Record<string, string>>({});
  const [addingEmailFor, setAddingEmailFor] = useState<string | null>(null);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState<string | null>(null);

  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [handlingRequest, setHandlingRequest] = useState<string | null>(null);

  async function fetchBookings(pw: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/bookings", {
      headers: { "x-admin-password": pw },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 401
          ? "Ongeldig wachtwoord"
          : data.error || "Er ging iets mis bij het laden van de boekingen"
      );
      setLoading(false);
      return false;
    }
    const data = await res.json();
    setBookings(data);
    setLoading(false);
    return true;
  }

  async function fetchMembers(pw: string) {
    setMembersLoading(true);
    setMemberError("");
    const res = await fetch("/api/admin/members", {
      headers: { "x-admin-password": pw },
    });
    if (res.ok) {
      setMembers(await res.json());
    }
    setMembersLoading(false);
  }

  async function fetchSubscriptions(pw: string) {
    setSubscriptionsLoading(true);
    const res = await fetch("/api/admin/subscriptions", {
      headers: { "x-admin-password": pw },
    });
    if (res.ok) {
      setSubscriptions(await res.json());
    }
    setSubscriptionsLoading(false);
  }

  async function fetchRequests(pw: string) {
    setRequestsLoading(true);
    const res = await fetch("/api/admin/membership-requests", {
      headers: { "x-admin-password": pw },
    });
    if (res.ok) {
      setRequests(await res.json());
    }
    setRequestsLoading(false);
  }

  async function handleApproveRequest(request: MembershipRequest) {
    setHandlingRequest(request.id);
    const res = await fetch(`/api/admin/membership-requests/${request.id}/approve`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het goedkeuren");
      setHandlingRequest(null);
      return;
    }
    await fetchRequests(password);
    setHandlingRequest(null);
  }

  async function handleRejectRequest(request: MembershipRequest) {
    if (!confirm(`Verzoek van "${request.band_name}" afwijzen?`)) return;
    setHandlingRequest(request.id);
    await fetch(`/api/admin/membership-requests/${request.id}/reject`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    await fetchRequests(password);
    setHandlingRequest(null);
  }

  async function handleCancelSubscription(subscription: Subscription) {
    if (
      !confirm(
        `Weet je zeker dat je de vaste reservering van "${subscription.band_name}" wilt opzeggen? De maandelijkse incasso stopt.`
      )
    ) {
      return;
    }

    setCancellingSubscription(subscription.id);
    const res = await fetch(`/api/admin/subscriptions/${subscription.id}/cancel`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het opzeggen");
      setCancellingSubscription(null);
      return;
    }

    await fetchSubscriptions(password);
    setCancellingSubscription(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await fetchBookings(password);
    if (ok) {
      setLoggedIn(true);
      fetchRequests(password);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setMemberError("");
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ name: newMemberName, email: newMemberEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMemberError(data.error || "Kon lid niet toevoegen");
      setAddingMember(false);
      return;
    }
    setNewMemberName("");
    setNewMemberEmail("");
    setAddingMember(false);
    await fetchMembers(password);
  }

  async function handleToggleMember(member: Member) {
    setTogglingMember(member.id);
    await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ active: !member.active }),
    });
    await fetchMembers(password);
    setTogglingMember(null);
  }

  async function handleDeleteMember(member: Member) {
    if (
      !confirm(`Weet je zeker dat je ${member.email} wilt verwijderen uit "${member.name}"?`)
    ) {
      return;
    }
    setDeletingMember(member.id);
    await fetch(`/api/admin/members/${member.id}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    await fetchMembers(password);
    setDeletingMember(null);
  }

  async function handleAddEmailToBand(bandName: string) {
    const email = (newEmailByBand[bandName] || "").trim();
    if (!email) return;
    setAddingEmailFor(bandName);
    setMemberError("");
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ name: bandName, email }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMemberError(data.error || "Kon e-mailadres niet toevoegen");
      setAddingEmailFor(null);
      return;
    }
    setNewEmailByBand((prev) => ({ ...prev, [bandName]: "" }));
    setAddingEmailFor(null);
    await fetchMembers(password);
  }

  async function handleCancel(bookingId: string, bandName: string) {
    if (!confirm(`Weet je zeker dat je de boeking van "${bandName}" wilt annuleren? Het bedrag wordt teruggestort.`)) {
      return;
    }

    setCancelling(bookingId);
    const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het annuleren");
      setCancelling(null);
      return;
    }

    await fetchBookings(password);
    setCancelling(null);
  }

  if (!loggedIn) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold mb-4 text-center">Beheerder login</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wachtwoord
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                placeholder="Admin wachtwoord"
              />
            </div>
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
              {loading ? "Laden..." : "Inloggen"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setView("bookings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === "bookings"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Boekingen
        </button>
        <button
          onClick={() => {
            setView("members");
            if (members.length === 0) fetchMembers(password);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === "members"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Leden
        </button>
        <button
          onClick={() => {
            setView("subscriptions");
            if (subscriptions.length === 0) fetchSubscriptions(password);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            view === "subscriptions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Abonnementen
        </button>
        <button
          onClick={() => {
            setView("requests");
            fetchRequests(password);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
            view === "requests"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Aanvragen
          {requests.filter((r) => r.status === "pending").length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {requests.filter((r) => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {view === "requests" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Lidmaatschapsverzoeken</h2>
            <button
              onClick={() => fetchRequests(password)}
              disabled={requestsLoading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              {requestsLoading ? "Laden..." : "Vernieuwen"}
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
              Geen aanvragen gevonden.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg truncate">{r.band_name}</h3>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                            r.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : r.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {r.status === "pending"
                            ? "Nieuw"
                            : r.status === "approved"
                              ? "Toegevoegd"
                              : "Afgewezen"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {r.contact_name} · {r.contact_email}
                        {r.contact_phone ? ` · ${r.contact_phone}` : ""}
                      </p>
                    </div>

                    {r.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleRejectRequest(r)}
                          disabled={handlingRequest === r.id}
                          className="px-4 py-2.5 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium min-h-[44px]"
                        >
                          Afwijzen
                        </button>
                        <button
                          onClick={() => handleApproveRequest(r)}
                          disabled={handlingRequest === r.id}
                          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium min-h-[44px]"
                        >
                          {handlingRequest === r.id ? "Bezig..." : "Toevoegen als lid"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : view === "subscriptions" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Vaste reserveringen</h2>
            <button
              onClick={() => fetchSubscriptions(password)}
              disabled={subscriptionsLoading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              {subscriptionsLoading ? "Laden..." : "Vernieuwen"}
            </button>
          </div>

          {subscriptions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
              Geen vaste reserveringen gevonden.
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg truncate">
                          {subscription.band_name}
                        </h3>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                            subscription.status === "active"
                              ? "bg-green-100 text-green-800"
                              : subscription.status === "pending_first_payment"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {subscription.status === "active"
                            ? "Actief"
                            : subscription.status === "pending_first_payment"
                              ? "Wacht op eerste betaling"
                              : "Opgezegd"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">
                        Elke {formatWeekdayDagdeel(subscription)} ·{" "}
                        {config.subscriptionPricing[subscription.frequency].label} ·{" "}
                        {formatPrice(subscription.price_cents)}/mnd
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {subscription.contact_name} · {subscription.contact_email}
                        {subscription.contact_phone ? ` · ${subscription.contact_phone}` : ""}
                      </p>
                    </div>

                    {subscription.status === "active" && (
                      <button
                        onClick={() => handleCancelSubscription(subscription)}
                        disabled={cancellingSubscription === subscription.id}
                        className="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium shrink-0 min-h-[44px] transition-colors"
                      >
                        {cancellingSubscription === subscription.id
                          ? "Opzeggen..."
                          : "Zeg op"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : view === "members" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Ledenlijst</h2>
            <button
              onClick={() => fetchMembers(password)}
              disabled={membersLoading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              {membersLoading ? "Laden..." : "Vernieuwen"}
            </button>
          </div>

          <form
            onSubmit={handleAddMember}
            className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              required
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Bandnaam"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
            <input
              type="email"
              required
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="E-mailadres"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
            <button
              type="submit"
              disabled={addingMember}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm shrink-0"
            >
              {addingMember ? "Toevoegen..." : "Band toevoegen"}
            </button>
          </form>
          <p className="text-xs text-gray-500 mb-4 -mt-2">
            Bestaat de band al? Vul dezelfde bandnaam in met een ander e-mailadres om een extra
            bandlid te autoriseren - iedereen in de band krijgt dan de bevestigingsmail.
          </p>

          {memberError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
              {memberError}
            </div>
          )}

          {members.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
              Nog geen leden toegevoegd.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(
                members.reduce<Record<string, Member[]>>((acc, m) => {
                  (acc[m.name] ??= []).push(m);
                  return acc;
                }, {})
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([bandName, bandMembers]) => (
                  <div
                    key={bandName}
                    className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4"
                  >
                    <p className="font-medium mb-2">{bandName}</p>
                    <div className="space-y-2 mb-3">
                      {bandMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-2 pl-3 border-l-2 border-gray-100"
                        >
                          <p className="text-sm text-gray-600 truncate min-w-0">
                            {member.email}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleMember(member)}
                              disabled={togglingMember === member.id}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] disabled:opacity-50 ${
                                member.active
                                  ? "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100"
                                  : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
                              }`}
                            >
                              {member.active ? "Actief lid" : "Inactief"}
                            </button>
                            <button
                              onClick={() => handleDeleteMember(member)}
                              disabled={deletingMember === member.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                            >
                              Verwijder
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pl-3">
                      <input
                        type="email"
                        value={newEmailByBand[bandName] || ""}
                        onChange={(e) =>
                          setNewEmailByBand((prev) => ({ ...prev, [bandName]: e.target.value }))
                        }
                        placeholder="Extra e-mailadres voor deze band"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                      <button
                        onClick={() => handleAddEmailToBand(bandName)}
                        disabled={addingEmailFor === bandName}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 shrink-0"
                      >
                        {addingEmailFor === bandName ? "Toevoegen..." : "Toevoegen"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Boekingen beheren</h2>
        <button
          onClick={() => fetchBookings(password)}
          disabled={loading}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {loading ? "Laden..." : "Vernieuwen"}
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          Geen aankomende boekingen gevonden.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg truncate">
                      {booking.band_name}
                    </h3>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        booking.status === "confirmed"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {booking.status === "confirmed" ? "Bevestigd" : "In afwachting"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {formatDate(booking.slot_date)},{" "}
                    {formatTime(booking.slot_start_time)} –{" "}
                    {formatTime(booking.slot_end_time)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {booking.contact_name} · {booking.contact_email}
                    {booking.contact_phone ? ` · ${booking.contact_phone}` : ""}
                  </p>
                </div>

                {booking.status === "confirmed" && (
                  <button
                    onClick={() => handleCancel(booking.id, booking.band_name)}
                    disabled={cancelling === booking.id}
                    className="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium shrink-0 min-h-[44px] transition-colors"
                  >
                    {cancelling === booking.id ? "Annuleren..." : "Annuleer boeking"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
