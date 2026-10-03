"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTariffs } from "./useTariffs";
import { config } from "@/config";
import { toLocalDateStr, hoursUntilSlot } from "@/lib/date";
import SubscriptionSection from "./SubscriptionSection";
import MembershipRequestPrompt from "./MembershipRequestPrompt";
import JoinRequestForm from "./JoinRequestForm";

type Slot = {
  date: string;
  dagdeelLabel: string;
  startTime: string;
  endTime: string;
  available: boolean;
};

type DaySlots = {
  date: string;
  dayLabel: string;
  slots: Slot[];
};

type SelectedSlot = {
  date: string;
  dagdeelLabel: string;
  startTime: string;
  endTime: string;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const formatDateStr = toLocalDateStr;

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Home() {
  const [mode, setMode] = useState<"once" | "subscription" | "join" | null>(null);
  const tariffs = useTariffs();
  const [storageFree, setStorageFree] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/storage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStorageFree(data ? data.free : null))
      .catch(() => setStorageFree(null));
  }, []);
  const [subscriptionFrequency, setSubscriptionFrequency] = useState<"weekly" | "biweekly">("weekly");
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [formData, setFormData] = useState({
    bandName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notAMember, setNotAMember] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const weekEndStr = (() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return formatDateStr(d);
  })();

  const weekStartStr = formatDateStr(weekStart);

  const today = new Date();
  const canGoPrev = weekStart > getWeekStart(today);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + config.maxWeeksAhead * 7);
  const canGoNext = new Date(weekEndStr + "T00:00:00") < maxDate;

  const maxDateStr = formatDateStr(maxDate);
  // De datepicker toont altijd de maandag van de weergegeven week, dus min moet
  // de maandag van deze week zijn - todayStr zou op elke dag na maandag al vóór
  // de weergegeven waarde liggen en de input ongeldig maken.
  const earliestWeekStartStr = formatDateStr(getWeekStart(today));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      const res = await fetch(`/api/slots?from=${weekStartStr}&to=${weekEndStr}`);
      const data = await res.json();
      if (!cancelled) {
        if (!res.ok) {
          setLoadError(data.error || "Kon beschikbare tijdslots niet ophalen");
          setDays([]);
        } else {
          setDays(data);
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [weekStartStr, weekEndStr]);

  function handlePrevWeek() {
    if (!canGoPrev) return;
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function handleNextWeek() {
    if (!canGoNext) return;
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  function handleDatePick(dateStr: string) {
    if (!dateStr) return;
    const picked = new Date(dateStr + "T00:00:00");
    const newWeekStart = getWeekStart(picked);
    const earliest = getWeekStart(today);
    if (newWeekStart < earliest) {
      setWeekStart(earliest);
    } else {
      setWeekStart(newWeekStart);
    }
  }

  async function handleEmailBlur(email: string) {
    if (!email || !email.includes("@")) return;
    const res = await fetch(`/api/members/check?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setNotAMember(!data.isMember);
  }

  function handleSlotClick(slot: Slot) {
    if (!slot.available) return;
    if (
      selectedSlot?.date === slot.date &&
      selectedSlot?.startTime === slot.startTime
    ) {
      setSelectedSlot(null);
      return;
    }
    setSelectedSlot({
      date: slot.date,
      dagdeelLabel: slot.dagdeelLabel,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setSubmitting(true);
    setError("");
    setNotAMember(false);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bandName: formData.bandName,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        slotDate: selectedSlot.date,
        slotStartTime: selectedSlot.startTime,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Er ging iets mis");
      setNotAMember(res.status === 403);
      setSubmitting(false);
      return;
    }

    window.location.href = data.checkoutUrl;
  }

  if (mode === null) {
    const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
    const euroShort = (cents: number) =>
      cents % 100 === 0 ? `€${cents / 100}` : euro(cents);
    const fixed = (frequency: "weekly" | "biweekly") => {
      const periodCents = frequency === "weekly" ? tariffs.weeklyCents : tariffs.biweeklyCents;
      const sessions = config.subscriptionPricing[frequency].sessionsPerPeriod;
      const perSession = Math.round(periodCents / sessions);
      return { periodCents, sessions, perSession };
    };
    const fixedOptions = (["biweekly", "weekly"] as const).map((frequency) => ({
      frequency,
      title: frequency === "weekly" ? "Elke week" : "Om de week",
      ...fixed(frequency),
    }));
    // Hoeveel goedkoper per keer dan een losse boeking (alleen tonen als dat zo is).
    const saving = tariffs.singleCents - Math.max(...fixedOptions.map((o) => o.perSession));

    const gear: { label: string; value: string }[] = [
      { label: "Drums", value: "Sonor Select Force Stage 2" },
      { label: "Gitaar", value: "Orange Crush Pro CR60 en Marshall DSL20CR" },
      { label: "Bas", value: "Hartke HD150" },
      { label: "Zang", value: "Yamaha EMX 312 SC, 4× Shure SM58, Shure Beta 57A" },
      { label: "Speakers", value: "4× Electro-Voice ELX 112" },
      { label: "Ruimte", value: "Airco, volledig geluidsdicht" },
    ];

    return (
      <div>
        {/* Telefoon: foto over de volle breedte. Vanaf tablet even breed als de inhoud (de foto
            is 1024 px breed) en hoger, zodat hij scherp blijft en niet tot een smalle reep
            wordt uitgesneden op een breed scherm. */}
        <section className="md:max-w-5xl md:mx-auto md:px-4 md:pt-8">
          <div className="relative h-60 sm:h-80 md:h-[26rem] overflow-hidden md:rounded-2xl">
            <Image
              src="/oefenruimte-overzicht.jpg"
              alt="De oefenruimte van Soulex met drumstel, versterkers en speakers"
              fill
              priority
              sizes="(min-width: 768px) 1024px, 100vw"
              className="object-cover object-[50%_30%] md:object-[50%_40%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-page via-page/50 to-blue-900/10" />
            <div className="absolute inset-x-0 bottom-0 max-w-5xl mx-auto px-4 md:px-8 pb-6 sm:pb-8 text-white">
              <h1 className="text-3xl sm:text-5xl font-bold font-[family-name:var(--font-slab)] drop-shadow">
                De oefenruimte van Soulex
              </h1>
              <p className="mt-2 max-w-xl text-sm sm:text-base text-blue-50">
                In gemeenschapshuis De Borgh in Budel. Geluidsdicht, met airco en een complete
                backline: neem alleen je eigen instrument mee. Je boekt per dagdeel van 4 uur.
              </p>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
          <h2 className="text-2xl font-bold text-ink font-[family-name:var(--font-slab)]">
            Hoe wil je repeteren?
          </h2>
          <p className="mt-1 mb-5 text-sm text-ink-muted">
            Alleen voor leden van {config.organizationName}.{" "}
            <button
              onClick={() => setMode("join")}
              className="text-ink underline underline-offset-2 hover:text-white"
            >
              Nog geen lid? Vraag toegang aan
            </button>
          </p>

          {/* Twee kolommen met dezelfde opbouw (kop, uitleg, kaartje met prijs en knop). Via
              subgrid delen ze dezelfde rijen, zodat kaartjes, prijzen en knoppen op één lijn
              staan, ook als de uitleg links langer is. */}
          <div className="grid gap-4 md:gap-0 md:grid-cols-[2fr_1fr] md:grid-rows-[auto_auto_1fr] md:bg-white md:rounded-2xl md:border md:border-gray-200 md:overflow-hidden">
            <div className="bg-blue-50 rounded-2xl md:rounded-none border border-blue-100 md:border-0 p-5 sm:p-6 md:grid md:grid-rows-subgrid md:row-span-3">
              <h3 className="text-lg font-semibold font-[family-name:var(--font-slab)] text-blue-900">
                Vaste plek
              </h3>
              <p className="text-sm text-gray-700 mt-1">
                Steeds hetzelfde dagdeel, het hele jaar door. Je betaalt per {config.periodWeeks}{" "}
                weken vooraf, er wordt niets automatisch afgeschreven.
                {saving > 0 && <> Per keer {euroShort(saving)} goedkoper dan los.</>}
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                {fixedOptions.map((o) => (
                  <div
                    key={o.frequency}
                    className="bg-white rounded-xl border border-blue-100 p-4 flex flex-col"
                  >
                    <p className="font-semibold text-blue-900">{o.title}</p>
                    <p className="mt-2">
                      <span className="text-3xl font-bold text-blue-900">{euroShort(o.perSession)}</span>{" "}
                      <span className="text-sm text-gray-600">per keer</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1 mb-4">
                      {euro(o.periodCents)} per {config.periodWeeks} weken ({o.sessions} keer)
                    </p>
                    <button
                      onClick={() => {
                        setSubscriptionFrequency(o.frequency);
                        setMode("subscription");
                      }}
                      className="mt-auto w-full py-2.5 bg-blue-600 border-2 border-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 hover:border-blue-700"
                    >
                      Dagdeel kiezen
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 md:border-0 md:border-l md:rounded-none p-5 sm:p-6 md:grid md:grid-rows-subgrid md:row-span-3">
              <h3 className="text-lg font-semibold font-[family-name:var(--font-slab)] text-blue-900">
                Een keer
              </h3>
              <p className="text-sm text-gray-600 mt-1">Een los dagdeel op een datum naar keuze.</p>
              <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
                <p className="font-semibold text-blue-900">Los dagdeel</p>
                <p className="mt-2">
                  <span className="text-3xl font-bold text-blue-900">{euroShort(tariffs.singleCents)}</span>{" "}
                  <span className="text-sm text-gray-600">per keer</span>
                </p>
                <p className="text-xs text-gray-600 mt-1 mb-4">Per boeking vooraf betalen</p>
                <button
                  onClick={() => setMode("once")}
                  className="mt-auto w-full py-2.5 bg-white border-2 border-blue-600 text-blue-700 rounded-lg font-medium hover:bg-blue-50"
                >
                  Datum kiezen
                </button>
              </div>
            </div>
          </div>

          <section className="mt-12 grid md:grid-cols-2 gap-6 items-center bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="relative h-56 md:h-full min-h-56">
              <Image
                src="/oefenruimte-drums.jpg"
                alt="Sonor drumstel en mengpaneel in de oefenruimte"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-5 sm:p-6">
              <h2 className="text-xl font-bold text-blue-900 font-[family-name:var(--font-slab)] mb-3">
                Wat staat er klaar?
              </h2>
              <dl className="grid grid-cols-2 gap-2">
                {gear.map((g) => (
                  <div key={g.label} className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                    <dt className="text-xs font-medium text-blue-700">{g.label}</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 leading-snug">{g.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-gray-700 mt-4">
                Opslagruimte bijhuren bij een vaste plek: {euro(tariffs.storageCents)} per{" "}
                {config.periodWeeks} weken.{" "}
                {storageFree === null
                  ? ""
                  : storageFree > 0
                    ? `Nog ${storageFree} van ${config.storage.units.length} vrij.`
                    : "Op dit moment allemaal verhuurd."}
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Sleutel, borg en lidmaatschap regel je eenmalig met het bestuur.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (mode === "join") {
    return <JoinRequestForm onBack={() => setMode(null)} />;
  }

  if (mode === "subscription") {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <button
          onClick={() => setMode(null)}
          className="text-sm text-ink-muted hover:text-ink mb-4"
        >
          ← Andere optie kiezen
        </button>
        <SubscriptionSection initialFrequency={subscriptionFrequency} />
      </div>
    );
  }

  return (
    <div className={`max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 ${selectedSlot ? "pb-[420px] sm:pb-[400px]" : ""}`}>
      <button
        onClick={() => setMode(null)}
        className="text-sm text-ink-muted hover:text-ink mb-4"
      >
        ← Andere optie kiezen
      </button>
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-6">
        <button
          onClick={handlePrevWeek}
          disabled={!canGoPrev}
          className="min-w-[44px] min-h-[44px] px-2 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-transparent disabled:text-ink-muted disabled:border-page-line disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          <span className="sm:hidden">&larr;</span>
          <span className="hidden sm:inline">&larr; Vorige week</span>
        </button>
        <h2 className="text-sm sm:text-lg font-semibold text-center min-w-0 text-ink">
          {formatDisplayDate(
            weekStartStr > formatDateStr(today) ? weekStartStr : formatDateStr(today)
          )}{" "}
          –{" "}
          {formatDisplayDate(weekEndStr)}
        </h2>
        <button
          onClick={handleNextWeek}
          disabled={!canGoNext}
          className="min-w-[44px] min-h-[44px] px-2 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-transparent disabled:text-ink-muted disabled:border-page-line disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          <span className="sm:hidden">&rarr;</span>
          <span className="hidden sm:inline">Volgende week &rarr;</span>
        </button>
      </div>

      {/* Date picker to jump to a specific week */}
      <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
        <label htmlFor="datepicker" className="text-sm text-ink-muted">
          Ga naar datum:
        </label>
        <input
          ref={dateInputRef}
          id="datepicker"
          type="date"
          min={earliestWeekStartStr}
          max={maxDateStr}
          value={weekStartStr}
          onChange={(e) => handleDatePick(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-muted">Laden...</div>
      ) : loadError ? (
        <div className="text-center py-12 text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {loadError}
        </div>
      ) : (
        // Op de telefoon één rij per dag (dagdelen naast elkaar), vanaf tablet een week in
        // kolommen. Dagen die al voorbij zijn, laten we weg.
        <div className="grid grid-cols-1 md:grid-flow-col md:auto-cols-fr gap-2 sm:gap-3">
          {days.filter((day) => day.date >= formatDateStr(today)).map((day) => {
            return (
              <div
                key={day.date}
                className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3"
              >
                <div className="text-sm font-semibold text-gray-700 mb-2 md:text-center">
                  {day.dayLabel}
                  <br className="hidden md:inline" />
                  <span className="text-xs text-gray-500 font-normal">
                    {" "}
                    {new Date(day.date + "T00:00:00").toLocaleDateString(
                      "nl-NL",
                      { day: "numeric", month: "short" }
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-1 gap-1.5">
                  {day.slots.map((slot) => {
                    // Voorbij (ook een eerder dagdeel van vandaag) of verder dan het
                    // boekingsvenster - de server weigert die ook.
                    const disabled =
                      !slot.available ||
                      hoursUntilSlot(slot.date, slot.startTime) <= 0 ||
                      slot.date > maxDateStr;
                    const isSelected =
                      selectedSlot?.date === slot.date &&
                      selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={`${slot.date}-${slot.startTime}`}
                        onClick={() => handleSlotClick(slot)}
                        disabled={disabled}
                        className={`w-full text-xs sm:text-sm py-2 sm:py-2.5 px-1.5 sm:px-2 rounded transition-colors min-h-[40px] ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : !slot.available
                              ? "bg-red-50 text-red-700 border border-red-200 cursor-not-allowed"
                              : disabled
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 active:bg-green-200 cursor-pointer"
                        }`}
                      >
                        <span className="block font-medium">{slot.dagdeelLabel}</span>
                        <span className="block text-[10px] sm:text-xs opacity-75">
                          {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
                        </span>
                        {!slot.available && (
                          <span className="block text-[10px] sm:text-xs opacity-75">
                            Bezet
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Docked booking panel at bottom of screen */}
      {selectedSlot && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] z-50">
          <div className="max-h-[75vh] overflow-y-auto overscroll-contain">
            <div className="max-w-lg mx-auto p-4 sm:p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Boeking maken</h3>
                  <p className="text-sm text-gray-600">
                    {selectedSlot.dagdeelLabel} · {formatFullDate(selectedSlot.date)},{" "}
                    {selectedSlot.startTime.slice(0, 5)} –{" "}
                    {selectedSlot.endTime.slice(0, 5)}
                    {" · "}
                    <span className="font-medium">
                      €{(tariffs.singleCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                  aria-label="Sluiten"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bandnaam *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.bandName}
                      onChange={(e) =>
                        setFormData({ ...formData, bandName: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, contactName: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                      placeholder="Je naam"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      E-mailadres *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.contactEmail}
                      onChange={(e) => {
                        setFormData({ ...formData, contactEmail: e.target.value });
                        setNotAMember(false);
                      }}
                      onBlur={(e) => handleEmailBlur(e.target.value)}
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
                      onChange={(e) =>
                        setFormData({ ...formData, contactPhone: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                      placeholder="06-12345678"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {notAMember && (
                  <MembershipRequestPrompt
                    bandName={formData.bandName}
                    contactName={formData.contactName}
                    contactEmail={formData.contactEmail}
                    contactPhone={formData.contactPhone}
                  />
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
                >
                  {submitting ? "Even geduld..." : "Betalen en boeken →"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
