"use client";

import { useState } from "react";
import { config } from "@/config";

export type CalendarEntry = {
  date: string;
  dagdeelLabel: string;
  kind: "booking" | "subscription" | "moved";
  provisional?: boolean; // na de laatste betaalde periode: onder voorbehoud van betaling
  title: string; // tooltip, bv. "Vaste reservering (verplaatst van 7 okt)"
};

// Een jaar vooruit (config.subscriptionPlanningWeeks) = zoveel maanden bladeren.
const MAX_MONTH_OFFSET = Math.ceil((config.subscriptionPlanningWeeks * 7) / 30.4);

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KIND_STYLE: Record<CalendarEntry["kind"], string> = {
  booking: "bg-green-100 text-green-800",
  subscription: "bg-blue-100 text-blue-800",
  moved: "bg-amber-100 text-amber-800",
};

// Maandoverzicht van alles wat de band gepland heeft (losse boekingen en de repetities
// van de vaste reservering, een jaar vooruit). Alleen weergave; acties staan eronder in
// de lijst.
export default function BandCalendar({
  entries,
  graceDays,
  hasSubscription,
}: {
  entries: CalendarEntry[];
  graceDays: number;
  hasSubscription: boolean;
}) {
  const today = new Date();
  const [offset, setOffset] = useState(0); // 0 = deze maand, 1 = volgende, ...
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const todayStr = toDateStr(today);

  // Rooster vanaf de maandag vóór de 1e van de maand
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - lead);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    cells.push(d);
  }
  const lastRowNeeded = cells.findLastIndex((d) => d.getMonth() === month.getMonth());
  const visible = cells.slice(0, Math.ceil((lastRowNeeded + 1) / 7) * 7);

  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-30"
          aria-label="Vorige maand"
        >
          ←
        </button>
        <p className="font-semibold capitalize">
          {month.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setOffset((o) => Math.min(MAX_MONTH_OFFSET, o + 1))}
          disabled={offset === MAX_MONTH_OFFSET}
          className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-30"
          aria-label="Volgende maand"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-gray-500 font-medium py-1">
            {d}
          </div>
        ))}
        {visible.map((d) => {
          const key = toDateStr(d);
          const inMonth = d.getMonth() === month.getMonth();
          const dayEntries = byDate.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-[52px] rounded border p-0.5 text-left ${
                inMonth ? "border-gray-100" : "border-transparent opacity-40"
              } ${key === todayStr ? "ring-2 ring-soulex-orange" : ""}`}
            >
              <span className="block text-[10px] text-gray-500 px-0.5">{d.getDate()}</span>
              {dayEntries.map((e, i) => (
                <span
                  key={i}
                  title={e.title}
                  className={`block truncate rounded px-0.5 text-[10px] leading-4 ${KIND_STYLE[e.kind]} ${
                    e.provisional ? "opacity-60 border border-dashed border-current" : ""
                  }`}
                >
                  {e.dagdeelLabel}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-100 inline-block" /> vaste reservering
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 inline-block" /> verplaatst
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-100 inline-block" /> losse boeking
        </span>
        {hasSubscription && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-100 opacity-60 border border-dashed border-blue-800 inline-block" />{" "}
            nog te betalen
          </span>
        )}
      </div>
      {hasSubscription && (
        <p className="text-xs text-gray-600 mt-2">
          Jullie vaste repetities staan een jaar vooruit ingepland. Ze blijven staan zolang elke
          periode van {config.periodWeeks} weken op tijd betaald is. Is een betaling{" "}
          {graceDays} dagen na de vervaldatum nog niet binnen, dan vervallen de komende
          repetities en komt het dagdeel vrij voor andere bands. De planning loopt door; het
          tarief per periode kan wijzigen.
        </p>
      )}
    </div>
  );
}
