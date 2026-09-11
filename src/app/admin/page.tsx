"use client";

import { useState } from "react";
import { config } from "@/config";
import { toLocalDateStr } from "@/lib/date";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

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

type SubscriptionPeriod = {
  id: string;
  period_month: string;
  amount_cents: number;
  due_date: string;
  grace_until: string;
  status: "unpaid" | "paid" | "waived";
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
  status: "pending_first_payment" | "active" | "lapsed" | "cancelled";
  currentPeriod: SubscriptionPeriod | null;
};

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
  });
}

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

  const [calWeekStart, setCalWeekStart] = useState<Date>(() => getWeekStart(new Date()));

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
    const checklistOk = confirm(
      `Voordat je "${request.band_name}" toevoegt als lid:\n\n☐ Contract getekend?\n☐ Borg ontvangen?\n\nKlik OK als beide zijn afgehandeld.`
    );
    if (!checklistOk) return;

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
        `Weet je zeker dat je de vaste reservering van "${subscription.band_name}" wilt opzeggen? Er worden geen betaalverzoeken meer verstuurd.`
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

  async function handleWaivePeriod(periodId: string) {
    if (
      !confirm(
        "Deze periode kwijtschelden? De band hoeft dan niet te betalen en het tijdslot blijft gewoon staan."
      )
    ) {
      return;
    }
    setCancellingSubscription(periodId);
    await fetch(`/api/admin/subscription-payments/${periodId}/waive`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    await fetchSubscriptions(password);
    setCancellingSubscription(null);
  }

  async function handleExtendGrace(periodId: string) {
    setCancellingSubscription(periodId);
    await fetch(`/api/admin/subscription-payments/${periodId}/extend-grace`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    await fetchSubscriptions(password);
    setCancellingSubscription(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await fetchBookings(password);
    if (ok) {
      setLoggedIn(true);
      fetchRequests(password);
      fetchSubscriptions(password);
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
                      {r.status === "pending" && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2 inline-block">
                          Eerst: contract getekend + borg ontvangen, voordat je toevoegt
                        </p>
                      )}
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
                                : subscription.status === "lapsed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {subscription.status === "active"
                            ? "Actief"
                            : subscription.status === "pending_first_payment"
                              ? "Wacht op eerste betaling"
                              : subscription.status === "lapsed"
                                ? "Vervallen (niet betaald)"
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
                      {subscription.status === "active" && subscription.currentPeriod && (
                        <p className="text-sm mt-2">
                          {subscription.currentPeriod.status === "paid" ? (
                            <span className="text-green-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_month)}: betaald
                            </span>
                          ) : subscription.currentPeriod.status === "waived" ? (
                            <span className="text-blue-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_month)}: kwijtgescholden
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_month)}: nog niet
                              betaald · coulance tot {formatShortDate(subscription.currentPeriod.grace_until)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {subscription.status === "active" &&
                        subscription.currentPeriod?.status === "unpaid" && (
                          <>
                            <button
                              onClick={() => handleExtendGrace(subscription.currentPeriod!.id)}
                              disabled={cancellingSubscription === subscription.currentPeriod!.id}
                              className="px-3 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium min-h-[44px]"
                            >
                              Coulance +14d
                            </button>
                            <button
                              onClick={() => handleWaivePeriod(subscription.currentPeriod!.id)}
                              disabled={cancellingSubscription === subscription.currentPeriod!.id}
                              className="px-3 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm font-medium min-h-[44px]"
                            >
                              Kwijtschelden
                            </button>
                          </>
                        )}
                      {(subscription.status === "active" || subscription.status === "lapsed") && (
                        <button
                          onClick={() => handleCancelSubscription(subscription)}
                          disabled={cancellingSubscription === subscription.id}
                          className="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium min-h-[44px] transition-colors"
                        >
                          {cancellingSubscription === subscription.id
                            ? "Opzeggen..."
                            : "Zeg op"}
                        </button>
                      )}
                    </div>
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
          onClick={() => {
            fetchBookings(password);
            fetchSubscriptions(password);
          }}
          disabled={loading}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
        >
          {loading ? "Laden..." : "Vernieuwen"}
        </button>
      </div>

      {(() => {
        const weekEnd = new Date(calWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const days: Date[] = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(calWeekStart);
          d.setDate(d.getDate() + i);
          return d;
        });

        return (
          <>
            <div className="flex items-center justify-between gap-2 mb-4">
              <button
                onClick={() => {
                  const d = new Date(calWeekStart);
                  d.setDate(d.getDate() - 7);
                  setCalWeekStart(d);
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                &larr; Vorige week
              </button>
              <h3 className="text-sm sm:text-base font-semibold text-center">
                {calWeekStart.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                {" – "}
                {weekEnd.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
              </h3>
              <button
                onClick={() => {
                  const d = new Date(calWeekStart);
                  d.setDate(d.getDate() + 7);
                  setCalWeekStart(d);
                }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                Volgende week &rarr;
              </button>
            </div>

            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
                Bevestigd
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300" />
                In afwachting
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-300" />
                Vaste reservering
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
              {days.map((day) => {
                const dateStr = toLocalDateStr(day);
                const weekday = day.getDay();
                return (
                  <div
                    key={dateStr}
                    className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3"
                  >
                    <div className="text-sm font-semibold text-gray-700 mb-2 text-center">
                      {DAY_NAMES_NL[weekday]}
                      <br />
                      <span className="text-xs text-gray-500">
                        {day.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {config.dagdelen.map((dagdeel) => {
                        const startTime = `${dagdeel.startHour.toString().padStart(2, "0")}:00`;
                        const endHour = dagdeel.startHour + config.slotDurationMinutes / 60;
                        const endTime = `${endHour.toString().padStart(2, "0")}:00`;

                        const booking = bookings.find(
                          (b) =>
                            b.slot_date === dateStr &&
                            b.slot_start_time.slice(0, 5) === startTime
                        );
                        const subscription = subscriptions.find(
                          (s) =>
                            s.status === "active" &&
                            s.weekday === weekday &&
                            s.dagdeel_id === dagdeel.id
                        );

                        if (booking) {
                          return (
                            <button
                              key={dagdeel.id}
                              onClick={() =>
                                booking.status === "confirmed" &&
                                handleCancel(booking.id, booking.band_name)
                              }
                              disabled={
                                booking.status !== "confirmed" || cancelling === booking.id
                              }
                              title={`${booking.contact_name} · ${booking.contact_email}${booking.contact_phone ? " · " + booking.contact_phone : ""}`}
                              className={`w-full text-left text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded border ${
                                booking.status === "confirmed"
                                  ? "bg-green-100 border-green-300 hover:bg-green-200 cursor-pointer"
                                  : "bg-yellow-100 border-yellow-300 cursor-default"
                              }`}
                            >
                              <span className="block font-medium">{dagdeel.label}</span>
                              <span className="block text-[10px] sm:text-xs opacity-75">
                                {startTime} – {endTime}
                              </span>
                              <span className="block text-[10px] sm:text-xs truncate font-medium">
                                {booking.band_name}
                              </span>
                            </button>
                          );
                        }

                        if (subscription) {
                          return (
                            <div
                              key={dagdeel.id}
                              title={`${subscription.contact_name} · ${subscription.contact_email}${subscription.contact_phone ? " · " + subscription.contact_phone : ""}`}
                              className="w-full text-left text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded border bg-blue-100 border-blue-300"
                            >
                              <span className="block font-medium">{dagdeel.label}</span>
                              <span className="block text-[10px] sm:text-xs opacity-75">
                                {startTime} – {endTime} · Vast
                              </span>
                              <span className="block text-[10px] sm:text-xs truncate font-medium">
                                {subscription.band_name}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={dagdeel.id}
                            className="w-full text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded border bg-gray-50 border-gray-200 text-gray-400"
                          >
                            <span className="block font-medium">{dagdeel.label}</span>
                            <span className="block text-[10px] sm:text-xs opacity-75">
                              {startTime} – {endTime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
        </>
      )}
    </div>
  );
}
