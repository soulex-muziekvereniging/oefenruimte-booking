"use client";

import { useEffect, useState, type ReactNode } from "react";
import { config } from "@/config";

type Outcome = "checking" | "success" | "processing" | "failed" | "unknown";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

// Mollie stuurt de bezoeker na het betalen altijd terug naar deze pagina - óók als de
// betaling is afgebroken of mislukt. Daarom eerst de echte status ophalen. De webhook kan
// een paar seconden later binnenkomen dan de bezoeker, dus bij "nog bezig" even opnieuw.
export default function PaymentResult({
  statusUrl,
  successStatuses,
  pendingStatuses,
  success,
  retryHref,
}: {
  statusUrl: string | null;
  successStatuses: string[];
  pendingStatuses: string[];
  success: ReactNode;
  retryHref: string;
}) {
  const [outcome, setOutcome] = useState<Outcome>(statusUrl ? "checking" : "unknown");

  useEffect(() => {
    if (!statusUrl) return;
    let cancelled = false;
    let polls = 0;

    async function check() {
      polls += 1;
      const res = await fetch(statusUrl!).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        setOutcome("unknown");
        return;
      }
      const { status } = await res.json();
      if (successStatuses.includes(status)) {
        setOutcome("success");
      } else if (pendingStatuses.includes(status)) {
        setOutcome("processing");
        if (polls < MAX_POLLS) setTimeout(check, POLL_INTERVAL_MS);
      } else {
        setOutcome("failed");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusUrl]);

  if (outcome === "success") return <>{success}</>;

  const content: Record<Exclude<Outcome, "success">, { icon: string; title: string; text: string }> = {
    checking: { icon: "⏳", title: "Even controleren...", text: "We kijken of je betaling binnen is." },
    processing: {
      icon: "⏳",
      title: "Betaling wordt verwerkt",
      text: `Je betaling is nog niet bevestigd. Zodra hij binnen is krijg je een bevestigingsmail. Geen mail binnen een uur? Neem contact op via ${config.organizationEmail}.`,
    },
    failed: {
      icon: "⚠️",
      title: "Betaling niet gelukt",
      text: "De betaling is afgebroken of mislukt, dus er is niets gereserveerd. Je kunt het opnieuw proberen.",
    },
    unknown: {
      icon: "❓",
      title: "Status onbekend",
      text: `We konden de status van je betaling niet ophalen. Kijk in je mail of je een bevestiging hebt gekregen, of neem contact op via ${config.organizationEmail}.`,
    },
  };
  const { icon, title, text } = content[outcome];

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-gray-600 mb-6">{text}</p>
        {outcome !== "checking" && (
          <a
            href={outcome === "failed" ? retryHref : "/"}
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {outcome === "failed" ? "Opnieuw proberen" : "Terug naar overzicht"}
          </a>
        )}
      </div>
    </div>
  );
}
