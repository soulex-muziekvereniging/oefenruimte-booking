"use client";

import { useState, useEffect } from "react";
import { config } from "@/config";
import { toLocalDateStr } from "@/lib/date";
import AdminSettings from "./AdminSettings";
import { formatRhythm, occursOn } from "@/lib/schedule";

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
  mollie_payment_id: string | null;
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
  period_start: string;
  period_end: string;
  amount_cents: number;
  due_date: string;
  grace_until: string;
  status: "unpaid" | "paid" | "waived";
  paid_by: string | null;
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
  start_date: string;
  storage_unit: string | null;
  price_cents: number;
  status: "pending_first_payment" | "active" | "lapsed" | "cancelled";
  active_until: string | null;
  currentPeriod: SubscriptionPeriod | null;
};

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
  });
}

type SubscriptionSwap = {
  id: string;
  subscription_id: string;
  original_date: string;
  new_date: string;
  new_dagdeel_id: string;
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

function formatRhythmLabel(subscription: Subscription): string {
  const text = formatRhythm(subscription);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

// Opgezegd én uitgelopen (of vervallen): mag weg uit het overzicht. Een opgezegde
// reservering waarvan de betaalde periode nog loopt, houdt het slot nog vast.
function isInactiveSubscription(s: Subscription): boolean {
  if (s.status === "lapsed") return true;
  if (s.status !== "cancelled") return false;
  return !s.active_until || s.active_until < toLocalDateStr(new Date());
}

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [view, setView] = useState<"bookings" | "members" | "subscriptions" | "requests" | "settings">(
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
  const [showInactiveSubscriptions, setShowInactiveSubscriptions] = useState(false);
  const [deletingSubscriptions, setDeletingSubscriptions] = useState(false);
  const [swaps, setSwaps] = useState<SubscriptionSwap[]>([]);

  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [handlingRequest, setHandlingRequest] = useState<string | null>(null);

  const [calWeekStart, setCalWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const [showAddBooking, setShowAddBooking] = useState(false);
  const [addBookingForm, setAddBookingForm] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    slotDate: "",
    storageUnit: "",
    dagdeelId: config.dagdelen[0].id,
    recurrence: "once" as "once" | "weekly" | "biweekly",
  });
  const [addingBooking, setAddingBooking] = useState(false);
  const [addBookingError, setAddBookingError] = useState("");

  const [showAddSubscription, setShowAddSubscription] = useState(false);
  const [addSubscriptionForm, setAddSubscriptionForm] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    startDate: "",
    storageUnit: "",
    frequency: "weekly" as "weekly" | "biweekly",
    dagdeelId: config.dagdelen[0].id,
  });
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [addSubscriptionError, setAddSubscriptionError] = useState("");

  async function fetchBookings() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/bookings");
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return false;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Er ging iets mis bij het laden van de boekingen");
      setLoading(false);
      return false;
    }
    const data = await res.json();
    setBookings(data);
    setLoading(false);
    return true;
  }

  async function fetchMembers() {
    setMembersLoading(true);
    setMemberError("");
    const res = await fetch("/api/admin/members");
    if (res.ok) {
      setMembers(await res.json());
    }
    setMembersLoading(false);
  }

  async function fetchSubscriptions() {
    setSubscriptionsLoading(true);
    const res = await fetch("/api/admin/subscriptions");
    if (res.ok) {
      setSubscriptions(await res.json());
    }
    setSubscriptionsLoading(false);
  }

  async function fetchSwaps() {
    const res = await fetch("/api/admin/subscription-swaps");
    if (res.ok) {
      setSwaps(await res.json());
    }
  }

  async function fetchRequests() {
    setRequestsLoading(true);
    const res = await fetch("/api/admin/membership-requests");
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
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het goedkeuren");
      setHandlingRequest(null);
      return;
    }
    await fetchRequests();
    setHandlingRequest(null);
  }

  async function handleRejectRequest(request: MembershipRequest) {
    if (!confirm(`Verzoek van "${request.band_name}" afwijzen?`)) return;
    setHandlingRequest(request.id);
    await fetch(`/api/admin/membership-requests/${request.id}/reject`, {
      method: "POST",
    });
    await fetchRequests();
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
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Er ging iets mis bij het opzeggen");
      setCancellingSubscription(null);
      return;
    }

    await fetchSubscriptions();
    setCancellingSubscription(null);
  }

  const storageUnitsInUse = subscriptions
    .filter(
      (s) =>
        s.storage_unit &&
        (s.status === "active" ||
          s.status === "pending_first_payment" ||
          (s.status === "cancelled" &&
            !!s.active_until &&
            s.active_until >= toLocalDateStr(new Date())))
    )
    .map((s) => s.storage_unit as string);

  async function handleStorageChange(subscription: Subscription, storageUnit: string) {
    const label = storageUnit ? `opslagruimte ${storageUnit}` : "geen opslagruimte";
    if (
      !confirm(
        `${subscription.band_name}: ${label}? Het bedrag per ${config.periodWeeks} weken past zich aan vanaf het volgende betaalverzoek.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/subscriptions/${subscription.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageUnit }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Opslaan is niet gelukt");
    }
    await fetchSubscriptions();
  }

  async function handleDeleteSubscriptions(targets: Subscription[]) {
    if (targets.length === 0) return;
    const label =
      targets.length === 1
        ? `de vaste reservering van "${targets[0].band_name}"`
        : `${targets.length} opgezegde/vervallen vaste reserveringen`;
    if (
      !confirm(
        `Weet je zeker dat je ${label} definitief wilt verwijderen? De betaalgeschiedenis ervan verdwijnt ook.`
      )
    ) {
      return;
    }

    setDeletingSubscriptions(true);
    const failed: string[] = [];
    for (const s of targets) {
      const res = await fetch(`/api/admin/subscriptions/${s.id}`, { method: "DELETE" });
      if (!res.ok) failed.push(s.band_name);
    }
    if (failed.length > 0) {
      alert(`Kon niet verwijderen: ${failed.join(", ")}`);
    }
    await fetchSubscriptions();
    setDeletingSubscriptions(false);
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
    const res = await fetch(`/api/admin/subscription-payments/${periodId}/waive`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Kwijtschelden is niet gelukt");
    }
    await fetchSubscriptions();
    setCancellingSubscription(null);
  }

  async function handleExtendGrace(periodId: string) {
    setCancellingSubscription(periodId);
    const res = await fetch(`/api/admin/subscription-payments/${periodId}/extend-grace`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Coulance verlengen is niet gelukt");
    }
    await fetchSubscriptions();
    setCancellingSubscription(null);
  }

  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => {
        if (res.ok) {
          setLoggedIn(true);
          fetchBookings();
          fetchRequests();
          fetchSubscriptions();
          fetchSwaps();
        } else {
          window.location.href = "/admin/login";
        }
      })
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setMemberError("");
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    await fetchMembers();
  }

  async function handleToggleMember(member: Member) {
    setTogglingMember(member.id);
    await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: !member.active }),
    });
    await fetchMembers();
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
    });
    await fetchMembers();
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
    await fetchMembers();
  }

  async function handleCancel(booking: Booking) {
    const paidOnline = !!booking.mollie_payment_id;
    if (
      !confirm(
        `Weet je zeker dat je de boeking van "${booking.band_name}" wilt annuleren?` +
          (paidOnline
            ? " Het bedrag wordt via Mollie teruggestort."
            : " Deze boeking is niet online betaald, er wordt niets teruggestort.")
      )
    ) {
      return;
    }

    setCancelling(booking.id);
    const cancel = (skipRefund: boolean) =>
      fetch(`/api/admin/bookings/${booking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipRefund }),
      });

    let res = await cancel(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (
        data.refundFailed &&
        confirm(
          `${data.error}

Toch annuleren zonder automatisch terugstorten? (Stort dan zelf terug via het Mollie-dashboard.)`
        )
      ) {
        res = await cancel(true);
      } else {
        if (!data.refundFailed) alert(data.error || "Er ging iets mis bij het annuleren");
        setCancelling(null);
        return;
      }
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Er ging iets mis bij het annuleren");
      setCancelling(null);
      return;
    }

    await fetchBookings();
    setCancelling(null);
  }

  async function handleAddBooking(e: React.FormEvent) {
    e.preventDefault();
    setAddingBooking(true);
    setAddBookingError("");

    const isRecurring = addBookingForm.recurrence !== "once";
    const { bandName, contactName, contactEmail, contactPhone } = addBookingForm;

    const res = await fetch(isRecurring ? "/api/admin/subscriptions" : "/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bandName,
        contactName,
        contactEmail,
        contactPhone,
        dagdeelId: addBookingForm.dagdeelId,
        ...(isRecurring
          ? {
              startDate: addBookingForm.slotDate,
              frequency: addBookingForm.recurrence,
              storageUnit: addBookingForm.storageUnit,
            }
          : { slotDate: addBookingForm.slotDate }),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAddBookingError(data.error || "Kon boeking niet aanmaken");
      setAddingBooking(false);
      return;
    }

    setAddBookingForm({
      bandName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      slotDate: "",
      storageUnit: "",
      dagdeelId: config.dagdelen[0].id,
      recurrence: "once",
    });
    setShowAddBooking(false);
    setAddingBooking(false);
    if (isRecurring) {
      await fetchSubscriptions();
    } else {
      await fetchBookings();
    }
  }

  async function handleAddSubscription(e: React.FormEvent) {
    e.preventDefault();
    setAddingSubscription(true);
    setAddSubscriptionError("");

    const res = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...addSubscriptionForm,
        frequency: addSubscriptionForm.frequency,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAddSubscriptionError(data.error || "Kon vaste reservering niet aanmaken");
      setAddingSubscription(false);
      return;
    }

    setAddSubscriptionForm({
      bandName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      startDate: "",
      storageUnit: "",
      frequency: "weekly",
      dagdeelId: config.dagdelen[0].id,
    });
    setShowAddSubscription(false);
    setAddingSubscription(false);
    await fetchSubscriptions();
  }

  if (!authChecked) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center text-gray-500">
        Laden...
      </div>
    );
  }

  if (!loggedIn) {
    // useEffect stuurt door naar /admin/login
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          {loggingOut ? "Bezig..." : "Uitloggen"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setView("bookings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
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
            if (members.length === 0) fetchMembers();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
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
            if (subscriptions.length === 0) fetchSubscriptions();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
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
            fetchRequests();
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
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
        <button
          onClick={() => setView("settings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
            view === "settings"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Instellingen
        </button>
      </div>

      {view === "settings" ? (
        <AdminSettings />
      ) : view === "requests" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Lidmaatschapsverzoeken</h2>
            <button
              onClick={() => fetchRequests()}
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
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddSubscription((v) => !v)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                {showAddSubscription ? "Annuleren" : "+ Toevoegen"}
              </button>
              <button
                onClick={() => fetchSubscriptions()}
                disabled={subscriptionsLoading}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
              >
                {subscriptionsLoading ? "Laden..." : "Vernieuwen"}
              </button>
            </div>
          </div>

          {showAddSubscription && (
            <form
              onSubmit={handleAddSubscription}
              className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3"
            >
              <p className="text-xs text-gray-500">
                Voor het overzetten van een bestaande afspraak: geen betaling nodig. De eerste 4
                weken vanaf de startdatum worden kwijtgescholden; daarna krijgt de band gewoon
                betaalverzoeken.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Bandnaam"
                  value={addSubscriptionForm.bandName}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, bandName: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                />
                <input
                  type="text"
                  required
                  placeholder="Contactpersoon"
                  value={addSubscriptionForm.contactName}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, contactName: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                />
                <input
                  type="email"
                  required
                  placeholder="E-mailadres"
                  value={addSubscriptionForm.contactEmail}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, contactEmail: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                />
                <input
                  type="tel"
                  placeholder="Telefoon (optioneel)"
                  value={addSubscriptionForm.contactPhone}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, contactPhone: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                />
                <select
                  value={addSubscriptionForm.frequency}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({
                      ...f,
                      frequency: e.target.value as "weekly" | "biweekly",
                    }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                >
                  <option value="weekly">Elke week</option>
                  <option value="biweekly">Om de week</option>
                </select>
                <input
                  type="date"
                  required
                  title="Eerste keer"
                  value={addSubscriptionForm.startDate}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                />
                <select
                  value={addSubscriptionForm.dagdeelId}
                  onChange={(e) =>
                    setAddSubscriptionForm((f) => ({ ...f, dagdeelId: e.target.value }))
                  }
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                >
                  {config.dagdelen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <select
                  value={addSubscriptionForm.storageUnit}
                  onChange={(e) => setAddSubscriptionForm((f) => ({ ...f, storageUnit: e.target.value }))}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                >
                  <option value="">Geen opslagruimte</option>
                  {config.storage.units.map((u) => (
                    <option key={u} value={u} disabled={storageUnitsInUse.includes(u)}>
                      Opslagruimte {u}
                      {storageUnitsInUse.includes(u) ? " (bezet)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {addSubscriptionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {addSubscriptionError}
                </div>
              )}
              <button
                type="submit"
                disabled={addingSubscription}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {addingSubscription ? "Toevoegen..." : "Vaste reservering toevoegen"}
              </button>
            </form>
          )}

          {(() => {
            const inactive = subscriptions.filter(isInactiveSubscription);
            if (inactive.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm">
                <button
                  onClick={() => setShowInactiveSubscriptions((v) => !v)}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {showInactiveSubscriptions
                    ? "Verberg opgezegde/vervallen"
                    : `Toon opgezegde/vervallen (${inactive.length})`}
                </button>
                {showInactiveSubscriptions && (
                  <button
                    onClick={() => handleDeleteSubscriptions(inactive)}
                    disabled={deletingSubscriptions}
                    className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 font-medium"
                  >
                    {deletingSubscriptions ? "Bezig..." : `Alle ${inactive.length} verwijderen`}
                  </button>
                )}
              </div>
            );
          })()}

          {subscriptions.filter((s) => showInactiveSubscriptions || !isInactiveSubscription(s)).length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
              Geen vaste reserveringen gevonden.
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions
                .filter((s) => showInactiveSubscriptions || !isInactiveSubscription(s))
                .map((subscription) => (
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
                                : subscription.active_until && subscription.active_until >= toLocalDateStr(new Date())
                                  ? `Opgezegd · slot nog tot ${formatShortDate(subscription.active_until)}`
                                  : "Opgezegd"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">
                        {formatRhythmLabel(subscription)} · sinds{" "}
                        {formatShortDate(subscription.start_date)} ·{" "}
                        {formatPrice(subscription.price_cents)} per {config.periodWeeks} weken
                        {subscription.storage_unit ? " (incl. opslag)" : ""}
                      </p>
                      {(subscription.status === "active" ||
                        subscription.status === "pending_first_payment") && (
                        <label className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          📦 Opslagruimte:
                          <select
                            value={subscription.storage_unit ?? ""}
                            onChange={(e) => handleStorageChange(subscription, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">geen</option>
                            {config.storage.units.map((u) => (
                              <option
                                key={u}
                                value={u}
                                disabled={
                                  u !== subscription.storage_unit && storageUnitsInUse.includes(u)
                                }
                              >
                                ruimte {u}
                                {u !== subscription.storage_unit && storageUnitsInUse.includes(u)
                                  ? " (bezet)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {subscription.contact_name} · {subscription.contact_email}
                        {subscription.contact_phone ? ` · ${subscription.contact_phone}` : ""}
                      </p>
                      {subscription.status === "active" && subscription.currentPeriod && (
                        <p className="text-sm mt-2">
                          {subscription.currentPeriod.status === "paid" ? (
                            <span className="text-green-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_start)} t/m{" "}
                              {formatShortDate(subscription.currentPeriod.period_end)}: betaald
                              {subscription.currentPeriod.paid_by
                                ? ` door ${subscription.currentPeriod.paid_by}`
                                : ""}
                            </span>
                          ) : subscription.currentPeriod.status === "waived" ? (
                            <span className="text-blue-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_start)} t/m{" "}
                              {formatShortDate(subscription.currentPeriod.period_end)}: kwijtgescholden
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              Periode {formatShortDate(subscription.currentPeriod.period_start)} t/m{" "}
                              {formatShortDate(subscription.currentPeriod.period_end)}: nog niet
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
                      {(subscription.status === "cancelled" ||
                        subscription.status === "lapsed") && (
                        <button
                          onClick={() => handleDeleteSubscriptions([subscription])}
                          disabled={deletingSubscriptions}
                          className="px-4 py-2.5 bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium min-h-[44px]"
                        >
                          Verwijderen
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
              onClick={() => fetchMembers()}
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddBooking((v) => !v)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {showAddBooking ? "Annuleren" : "+ Toevoegen"}
          </button>
          <button
            onClick={() => {
              fetchBookings();
              fetchSubscriptions();
              fetchSwaps();
            }}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            {loading ? "Laden..." : "Vernieuwen"}
          </button>
        </div>
      </div>

      {showAddBooking && (
        <form
          onSubmit={handleAddBooking}
          className="bg-white rounded-lg border border-gray-200 p-4 mb-6 space-y-3"
        >
          <p className="text-xs text-gray-500">
            Voor het overzetten van een bestaande afspraak: komt direct als bevestigd (of, bij
            een herhaling, als actieve vaste reservering) te staan - geen betaling nodig.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="Bandnaam"
              value={addBookingForm.bandName}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, bandName: e.target.value }))}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            />
            <input
              type="text"
              required
              placeholder="Contactpersoon"
              value={addBookingForm.contactName}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, contactName: e.target.value }))}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            />
            <input
              type="email"
              required
              placeholder="E-mailadres"
              value={addBookingForm.contactEmail}
              onChange={(e) =>
                setAddBookingForm((f) => ({ ...f, contactEmail: e.target.value }))
              }
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            />
            <input
              type="tel"
              placeholder="Telefoon (optioneel)"
              value={addBookingForm.contactPhone}
              onChange={(e) =>
                setAddBookingForm((f) => ({ ...f, contactPhone: e.target.value }))
              }
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            />
            <select
              value={addBookingForm.recurrence}
              onChange={(e) =>
                setAddBookingForm((f) => ({
                  ...f,
                  recurrence: e.target.value as "once" | "weekly" | "biweekly",
                }))
              }
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:col-span-2"
            >
              <option value="once">Eenmalig, op een datum</option>
              <option value="weekly">Vaste reservering, elke week</option>
              <option value="biweekly">Vaste reservering, om de week</option>
            </select>
            <input
              type="date"
              title={addBookingForm.recurrence === "once" ? "Datum" : "Eerste keer"}
              required
              value={addBookingForm.slotDate}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, slotDate: e.target.value }))}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            />
            <select
              value={addBookingForm.dagdeelId}
              onChange={(e) => setAddBookingForm((f) => ({ ...f, dagdeelId: e.target.value }))}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
            >
              {config.dagdelen.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            {addBookingForm.recurrence !== "once" && (
                  <select
                    value={addBookingForm.storageUnit}
                    onChange={(e) => setAddBookingForm((f) => ({ ...f, storageUnit: e.target.value }))}
                    className="px-3 py-2.5 border border-gray-300 rounded-lg text-base"
                  >
                    <option value="">Geen opslagruimte</option>
                    {config.storage.units.map((u) => (
                      <option key={u} value={u} disabled={storageUnitsInUse.includes(u)}>
                        Opslagruimte {u}
                        {storageUnitsInUse.includes(u) ? " (bezet)" : ""}
                      </option>
                    ))}
                  </select>
            )}
          </div>
          {addBookingError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {addBookingError}
            </div>
          )}
          <button
            type="submit"
            disabled={addingBooking}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {addingBooking
              ? "Toevoegen..."
              : addBookingForm.recurrence === "once"
                ? "Boeking toevoegen"
                : "Vaste reservering toevoegen"}
          </button>
        </form>
      )}

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
                            (s.status === "active" ||
                              (s.status === "cancelled" && !!s.active_until)) &&
                            s.weekday === weekday &&
                            s.dagdeel_id === dagdeel.id &&
                            occursOn(s, dateStr)
                        );
                        const swappedAway =
                          subscription &&
                          swaps.some(
                            (sw) => sw.subscription_id === subscription.id && sw.original_date === dateStr
                          );
                        const swappedIn = swaps.find(
                          (sw) => sw.new_date === dateStr && sw.new_dagdeel_id === dagdeel.id
                        );
                        const swappedInSubscription = swappedIn
                          ? subscriptions.find((s) => s.id === swappedIn.subscription_id)
                          : undefined;

                        if (booking) {
                          return (
                            <button
                              key={dagdeel.id}
                              onClick={() =>
                                booking.status === "confirmed" &&
                                handleCancel(booking)
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

                        if (swappedInSubscription) {
                          return (
                            <div
                              key={dagdeel.id}
                              title={`${swappedInSubscription.contact_name} · ${swappedInSubscription.contact_email}${swappedInSubscription.contact_phone ? " · " + swappedInSubscription.contact_phone : ""}`}
                              className="w-full text-left text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded border bg-blue-100 border-blue-300"
                            >
                              <span className="block font-medium">{dagdeel.label}</span>
                              <span className="block text-[10px] sm:text-xs opacity-75">
                                {startTime} – {endTime} · Vast (geruild)
                              </span>
                              <span className="block text-[10px] sm:text-xs truncate font-medium">
                                {swappedInSubscription.band_name}
                              </span>
                            </div>
                          );
                        }

                        if (subscription && !swappedAway) {
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
