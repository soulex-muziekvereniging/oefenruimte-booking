"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

// Hoe ver vooruit leden kunnen boeken, zoals ingesteld in het beheer (eerst de standaard,
// dan de opgeslagen waarde zodra die binnen is).
export function useMaxWeeksAhead(): number {
  const [weeks, setWeeks] = useState<number>(config.maxWeeksAhead);
  useEffect(() => {
    fetch("/api/booking-horizon")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && typeof data.weeks === "number" && setWeeks(data.weeks))
      .catch(() => {});
  }, []);
  return weeks;
}
